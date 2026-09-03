import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, suppliers, warehouses, products, journalEntries, journalEntryLines, inventoryMovements, inventoryLevels, chartOfAccounts, checks, accountsPayable, apPayments, supplierPaymentApplied, auditLogs } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { esSistemas } from '@/utils/rolMatch';
import { eq, and, or, inArray, sql, isNull, desc } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { resolverCuentaDeBanco, resolverCuentaPorPagar, resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';
import { AccountRepository } from '@/repositories/accountRepository';
import { v4 as uuidv4 } from 'uuid';
import { isValidNcfFormat, isElectronicNcf } from '@/utils/ncfValidator';

// Auditoria P0-05 (2026-09-03): `getOrCreateAccount` vivia aqui -- eliminado.
// Creaba cuentas sobre la marcha sin `nature`/`level` correctos, y no
// distinguia una cuenta de agrupacion ('2.1.01', '1.1.01') de su hija
// transaccional. Las cuentas de este modulo se resuelven ahora con
// `resolverCuentaPorMapeo` (services/accounting/resolverCuentas.ts), que
// nunca crea y siempre valida.

/**
 * Auditoria P0-07 (2026-09-03): revierte un asiento contable con un asiento
 * de reversión explícito, en vez de borrarlo.
 *
 * El original queda intacto en el mayor -- nada desaparece, todo sigue
 * siendo consultable y auditable, exactamente igual que espera cualquier
 * revisor. La reversión usa las MISMAS cuentas con el debe y el haber
 * invertidos, así que el efecto neto es cero -- la misma técnica que ya usa
 * la Nota de Crédito (e-CF 34) en invoiceDbBooker.ts. Pasa por
 * `createJournalEntry`, así que vuelve a pasar por `isPeriodOpen` (no puede
 * reabrir un período ya cerrado) y por la validación de cuentas de la red de
 * seguridad (P0-05): si alguna cuenta del asiento original ya no es válida,
 * la reversión falla con un mensaje claro en vez de fallar en silencio.
 */
async function revertirAsientoContable(
  tx: any,
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  journalEntryId: string,
  motivo: string,
  userId: string
) {
  const [original] = await tx
    .select({ date: journalEntries.date, description: journalEntries.description })
    .from(journalEntries)
    .where(eq(journalEntries.id, journalEntryId))
    .limit(1);

  if (!original) return;

  const lineas = await tx
    .select({ accountId: journalEntryLines.accountId, debit: journalEntryLines.debit, credit: journalEntryLines.credit })
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, journalEntryId));

  if (lineas.length === 0) return;

  await AccountRepository.createJournalEntry(tx, {
    companyId,
    modo,
    reference: journalEntryId,
    date: original.date,
    description: `Reversión — ${motivo} (asiento original: ${original.description || journalEntryId})`,
    lines: lineas.map((l: any) => ({
      accountId: l.accountId,
      debit: parseFloat(l.credit) || 0,
      credit: parseFloat(l.debit) || 0,
    })),
    createdBy: userId,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { id } = await params;

    const expenseResult = await db
      .select({
        id: expenses.id,
        companyId: expenses.companyId,
        warehouseId: expenses.warehouseId,
        supplierId: expenses.supplierId,
        expenseType: expenses.expenseType,
        isMinorExpense: expenses.isMinorExpense,
        ncf: expenses.ncf,
        ncfModified: expenses.ncfModified,
        issueDate: expenses.issueDate,
        paymentDate: expenses.paymentDate,
        amount: expenses.amount,
        itbis: expenses.itbis,
        itbisRetained: expenses.itbisRetained,
        itbisProportionality: expenses.itbisProportionality,
        isrRetained: expenses.isrRetained,
        isc: expenses.isc,
        otherTaxes: expenses.otherTaxes,
        tip: expenses.tip,
        paymentMethod: expenses.paymentMethod,
        description: expenses.description,
        createdAt: expenses.createdAt,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        warehouseName: warehouses.name,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(and(
        eq(expenses.id, id),
        eq(expenses.companyId, session.companyId),
        eq(expenses.modo, session.modo)
      ))
      .limit(1);

    if (expenseResult.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Gasto/Compra no encontrado' } }, { status: 404 });
    }

    const lines = await db
      .select()
      .from(expenseLines)
      .where(eq(expenseLines.expenseId, id));

    // Auditoria P0-07 (2026-09-03): una compra editada más de una vez ahora
    // puede tener varios asientos con esta misma referencia -- el original de
    // cada edición ya no se borra, se REVIERTE (ver `revertirAsientoContable`
    // en el PUT de más abajo). Sin ordenar por fecha de creación, este
    // `.limit(1)` podía devolver un asiento antiguo y prellenar el formulario
    // de edición con la cuenta contable equivocada.
    const jes = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)))
      .orderBy(desc(journalEntries.createdAt))
      .limit(1);

    let debitAccountId = null;
    if (jes.length > 0) {
      const debitLines = await db
        .select({ accountId: journalEntryLines.accountId })
        .from(journalEntryLines)
        .where(and(
          eq(journalEntryLines.journalEntryId, jes[0].id),
          sql`${journalEntryLines.debit} > 0`
        ))
        .limit(1);
      if (debitLines.length > 0) {
        debitAccountId = debitLines[0].accountId;
      }
    }

    // Load guarantee check if it exists
    let guaranteeCheck = null;
    let [checkRecord] = await db
      .select()
      .from(checks)
      .where(and(
        eq(checks.apId, id),
        eq(checks.isGuarantee, true),
        eq(checks.companyId, session.companyId),
        eq(checks.modo, session.modo)
      ))
      .limit(1);

    // Fallback: search via matching accountsPayable record for backward compatibility
    if (!checkRecord && expenseResult[0].supplierId) {
      const apRecords = await db
        .select({ id: accountsPayable.id })
        .from(accountsPayable)
        .where(and(
          eq(accountsPayable.supplierId, expenseResult[0].supplierId),
          eq(accountsPayable.amount, expenseResult[0].amount),
          eq(accountsPayable.companyId, session.companyId),
          eq(accountsPayable.modo, session.modo),
          isNull(accountsPayable.deletedAt)
        ));

      for (const ap of apRecords) {
        const [foundCheck] = await db
          .select()
          .from(checks)
          .where(and(
            eq(checks.apId, ap.id),
            eq(checks.isGuarantee, true),
            eq(checks.companyId, session.companyId),
            eq(checks.modo, session.modo)
          ))
          .limit(1);
        if (foundCheck) {
          checkRecord = foundCheck;
          break;
        }
      }
    }

    const formatDbDateString = (date: Date | string | null | undefined): string | null => {
      if (!date) return null;
      const d = typeof date === 'string' ? new Date(date) : date;
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (checkRecord) {
      guaranteeCheck = {
        bankAccountId: checkRecord.bankAccountId,
        checkNumber: checkRecord.checkNumber,
        payee: checkRecord.payee,
        amount: parseFloat(checkRecord.amount),
        issueDate: formatDbDateString(checkRecord.issueDate),
        dueDate: formatDbDateString(checkRecord.dueDate),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        ...expenseResult[0],
        issueDate: formatDbDateString(expenseResult[0].issueDate),
        paymentDate: formatDbDateString(expenseResult[0].paymentDate),
        lines,
        debitAccountId,
        guaranteeCheck
      }
    });
  } catch (err: any) {
    console.error('Error fetching expense details:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria P0-02 (2026-09-03): antes .includes('sistema'), que dejaba
    // borrar una compra -- y su asiento contable completo -- a cualquier rol
    // cuyo nombre contuviera esas letras (ej. "Soporte de Sistemas"), sin que
    // nadie le otorgara ese permiso explicitamente. Ver utils/rolMatch.ts.
    if (!esSistemas(session.role)) {
      return NextResponse.json({ success: false, error: { message: 'No tiene permisos para realizar esta acción. Solo usuarios de Sistemas pueden eliminar compras.' } }, { status: 403 });
    }

    const { id } = await params;

    const deleted = await db.transaction(async (tx) => {
      // 1. Get the expense header to verify ownership and get warehouseId
      const expHeaders = await tx
        .select()
        .from(expenses)
        .where(and(
          eq(expenses.id, id),
          eq(expenses.companyId, session.companyId),
          eq(expenses.modo, session.modo)
        ));

      if (expHeaders.length === 0) {
        return null;
      }

      const expenseRow = expHeaders[0];
      const warehouseId = expenseRow.warehouseId;

      // Auditoria P0-07 (2026-09-03): bloquear si el período contable de esta
      // compra ya está cerrado -- igual que ya bloquea la CREACIÓN de
      // asientos (`AccountingRepository.isPeriodOpen`). Sin esto, cualquier
      // usuario de Sistemas podía eliminar por completo una compra -- asiento,
      // kardex y CxP incluidos -- de un mes ya cerrado y reportado a la DGII,
      // sin bloqueo ni rastro.
      const periodoAbierto = await AccountRepository.isPeriodOpen(session.companyId, expenseRow.issueDate, session.modo, tx);
      if (!periodoAbierto) {
        const err: any = new Error(
          `No se puede eliminar esta compra: su período contable (fecha ${expenseRow.issueDate}) ya está cerrado. ` +
          `Ábralo en Contabilidad > Períodos si de verdad necesita corregirla, o revierta el cierre.`
        );
        err.status = 409;
        throw err;
      }

      // Auditoria P0-07 (2026-09-03): registrar el estado previo COMPLETO
      // antes de borrar nada. Sin esto, una compra eliminada -- asiento,
      // kardex y CxP incluidos -- no dejaba ningún rastro de que existió, ni
      // de quién la borró. Se lee todo ANTES de que el resto de esta función
      // empiece a mutar nada.
      const snapshotLineas = await tx.select().from(expenseLines).where(eq(expenseLines.expenseId, id));
      const snapshotAsientos = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));
      const idsAsientosSnapshot = snapshotAsientos.map((j: any) => j.id);
      const snapshotLineasAsiento = idsAsientosSnapshot.length > 0
        ? await tx.select().from(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, idsAsientosSnapshot))
        : [];
      const snapshotAp = await tx
        .select()
        .from(accountsPayable)
        .where(and(
          eq(accountsPayable.companyId, session.companyId),
          eq(accountsPayable.modo, session.modo),
          or(eq(accountsPayable.expenseId, id), eq(accountsPayable.id, id))
        ));
      const snapshotMovimientos = await tx
        .select()
        .from(inventoryMovements)
        .where(and(
          eq(inventoryMovements.referenceId, id),
          eq(inventoryMovements.companyId, session.companyId),
          eq(inventoryMovements.modo, session.modo)
        ));

      await tx.insert(auditLogs).values({
        companyId: session.companyId,
        modo: session.modo,
        userId: session.userId,
        action: 'delete_expense',
        entityType: 'expenses',
        entityId: id,
        oldValues: {
          expense: expenseRow,
          lines: snapshotLineas,
          journalEntries: snapshotAsientos,
          journalEntryLines: snapshotLineasAsiento,
          accountsPayable: snapshotAp,
          inventoryMovements: snapshotMovimientos,
        },
        ipAddress: ip,
      });

      // 2. Get the expense lines before deleting to adjust inventory levels
      const linesList = await tx
        .select({ productId: expenseLines.productId, quantity: expenseLines.quantity })
        .from(expenseLines)
        .where(eq(expenseLines.expenseId, id));

      // 3. Revert inventory levels if warehouse is defined
      if (warehouseId) {
        for (const line of linesList) {
          if (line.productId) {
            const qty = parseFloat(line.quantity) || 0;
            // Fetch current inventory level
            // El filtro por empresa es obligatorio: productId y warehouseId
            // llegan del cuerpo de la peticion. Sin el, esta lectura localizaba
            // el nivel de OTRA empresa y el UPDATE de abajo, que se ancla en
            // levelResult[0].id, le reescribia la existencia. Era escritura
            // cruzada, no solo lectura.
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.companyId, session.companyId),
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, warehouseId),
                eq(inventoryLevels.modo, session.modo)
              ));
            
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              const balanceAfter = Math.max(0, currentBalance - qty);
              await tx
                .update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(eq(inventoryLevels.id, levelResult[0].id));
            }
          }
        }
      }

      // 4. Delete inventory movements associated with this purchase
      await tx
        .delete(inventoryMovements)
        .where(and(eq(inventoryMovements.referenceId, id), eq(inventoryMovements.companyId, session.companyId), eq(inventoryMovements.modo, session.modo)));

      // 4-bis. Limpiar la cadena de Cuentas por Pagar del gasto:
      //        accounts_payable -> checks (garantía) -> ap_payments.
      //
      // Antes esto NO se hacía: al borrar una compra a crédito la CxP, el cheque en
      // garantía y el ap_payment quedaban vivos. El cheque se quedaba en 'pending'
      // para siempre, disparando la alerta "listo para cobro" del dashboard sin que
      // ninguna pantalla pudiera aplicarlo ni limpiarlo.
      //
      // Nota: la CxP se crea con id = id del gasto (ver POST /expenses), y además
      // guarda expense_id. Se buscan las dos formas por compatibilidad.
      const relatedAps = await tx
        .select({ id: accountsPayable.id })
        .from(accountsPayable)
        .where(and(
          eq(accountsPayable.companyId, session.companyId),
          eq(accountsPayable.modo, session.modo),
          or(eq(accountsPayable.expenseId, id), eq(accountsPayable.id, id))
        ));

      for (const ap of relatedAps) {
        // Seguridad contable: un pago ya aplicado significa que hubo movimiento real
        // de dinero (asiento contable, salida de banco, movimiento financiero).
        // Borrarlo en silencio descuadraría el banco y el mayor, así que se bloquea
        // el borrado y se exige revertir el pago primero.
        const apPaymentRows = await tx
          .select({ id: apPayments.id, checkId: apPayments.checkId, status: apPayments.status })
          .from(apPayments)
          .where(eq(apPayments.apId, ap.id));

        const appliedCount = apPaymentRows.filter((r: any) => r.status === 'applied').length;

        if (appliedCount > 0) {
          const err: any = new Error(
            'No se puede eliminar esta compra: ya tiene pagos aplicados contablemente (afectaron banco y mayor). Revierta o anule esos pagos antes de eliminarla.'
          );
          err.status = 409;
          throw err;
        }

        const [spaCount] = await tx
          .select({ n: sql<number>`count(*)` })
          .from(supplierPaymentApplied)
          .where(eq(supplierPaymentApplied.apId, ap.id));

        if (Number(spaCount?.n || 0) > 0) {
          const err: any = new Error(
            'No se puede eliminar esta compra: tiene pagos a suplidor aplicados contra su balance. Desaplique esos pagos antes de eliminarla.'
          );
          err.status = 409;
          throw err;
        }

        // Solo quedan cheques en garantía pendientes: no generan asiento, ni salida
        // de banco, ni movimiento financiero. Se pueden borrar sin efecto contable.
        // Orden obligatorio por las llaves foráneas: pagos -> cheques -> CxP.
        const linkedCheckIds = apPaymentRows
          .map((r: any) => r.checkId)
          .filter((v: string | null): v is string => Boolean(v));

        await tx.delete(apPayments).where(and(eq(apPayments.apId, ap.id), eq(apPayments.companyId, session.companyId), eq(apPayments.modo, session.modo)));

        // Por apId y además por los checkId referenciados: un cheque re-apuntado
        // durante una edición previa puede tener apId distinto y quedaría huérfano.
        await tx.delete(checks).where(and(
          eq(checks.companyId, session.companyId),
          eq(checks.modo, session.modo),
          linkedCheckIds.length > 0
            ? or(eq(checks.apId, ap.id), inArray(checks.id, linkedCheckIds))
            : eq(checks.apId, ap.id)
        ));

        await tx.delete(accountsPayable).where(eq(accountsPayable.id, ap.id));
      }

      // 5. Revertir (no borrar) los asientos contables de esta compra.
      //
      // Auditoria P0-07 (2026-09-03): antes se borraban físicamente --
      // líneas primero, cabecera después. Nada en el schema lo impedía, pero
      // borrar destruye el rastro contable, y contradice el propio diseño:
      // `journal_entries.deletedAt` existe justamente para poder ocultar un
      // asiento de los reportes sin volarlo de la base de datos. Aquí se usa
      // la técnica todavía más correcta -- un asiento de REVERSIÓN explícito
      // (ver `revertirAsientoContable` arriba) -- para que el original quede
      // intacto y el efecto neto en el mayor sea cero, sin nada invisible.
      for (const je of snapshotAsientos) {
        await revertirAsientoContable(
          tx,
          session.companyId,
          session.modo,
          je.id,
          `Eliminación de compra NCF: ${expenseRow.ncf || 'N/A'}`,
          session.userId
        );
      }

      // 6. Delete expense lines explicitly (safety cascade)
      await tx
        .delete(expenseLines)
        .where(eq(expenseLines.expenseId, id));

      // 7. Delete the expense header
      const del = await tx
        .delete(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)))
        .returning();

      return del;
    });

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Gasto/Compra no encontrado o no autorizado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Compra/Gasto y sus registros contables asociados eliminados exitosamente' });
  } catch (err: any) {
    console.error('Error deleting expense:', err);
    // err.status permite devolver 409 cuando el borrado se bloquea por pagos aplicados.
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: err.status || 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    if (!isAdminOrSistemas(session.role)) {
      return NextResponse.json({ success: false, error: { message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden editar compras.' } }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { 
      supplierId, 
      expenseType, 
      isMinorExpense, 
      ncf, 
      ncfModified, 
      issueDate, 
      paymentDate, 
      amount, 
      itbis, 
      itbisRetained, 
      itbisProportionality, 
      isrRetained, 
      isc, 
      otherTaxes, 
      tip, 
      paymentMethod, 
      description,
      warehouseId,
      lines, // Array of { productId, description, quantity, unitCost, subtotal, itbis, total }
      debitAccountId,
      guaranteeCheck
    } = body;

    // Validation
    if (!expenseType || !issueDate || amount === undefined || paymentMethod === undefined) {
      return NextResponse.json({ success: false, error: { message: 'Faltan campos requeridos.' } }, { status: 400 });
    }

    if (!isMinorExpense) {
      if (!supplierId) {
        return NextResponse.json({ success: false, error: { message: 'Suplidor es requerido para compras formales.' } }, { status: 400 });
      }
      if (!ncf) {
        return NextResponse.json({ success: false, error: { message: 'El NCF es requerido para compras formales.' } }, { status: 400 });
      }
      if (!isValidNcfFormat(ncf)) {
        return NextResponse.json({ success: false, error: { message: 'El formato del NCF ingresado es inválido. Debe ser un NCF estándar de 11 caracteres (ej. B0100000001) o un e-NCF de 13 caracteres (ej. E310100000001).' } }, { status: 400 });
      }
    } else {
      if (ncf && ncf.trim().length > 0 && isElectronicNcf(ncf)) {
        return NextResponse.json({ success: false, error: { message: 'Esta compra no puede guardarse como gasto menor ya que tiene e-NCF' } }, { status: 400 });
      }
    }

    // Productos sin control de existencia (servicios, venta por encargo).
    const sinInventario = new Set<string>();

    // El almacen y los productos que llegan en el cuerpo tienen que ser de la
    // empresa de la sesion. Mismo control que hace ya
    // /api/v1/inventory/adjustments: sin el, un gasto podia quedar guardado
    // apuntando al almacen de otra empresa, y todas las lecturas de inventario
    // que cuelgan de ese gasto arrastraban despues el error.
    if (warehouseId) {
      const [almacen] = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(
          eq(warehouses.id, warehouseId),
          eq(warehouses.companyId, session.companyId)
        ))
        .limit(1);
      if (!almacen) {
        return NextResponse.json(
          { success: false, error: { message: 'Almacén no encontrado.' } },
          { status: 404 }
        );
      }

      const idsProducto = [...new Set(
        (lines || []).map((l: { productId?: string }) => l.productId).filter(Boolean)
      )] as string[];
      if (idsProducto.length > 0) {
        const propios = await db
          .select({ id: products.id, tracksInventory: products.tracksInventory })
          .from(products)
          .where(and(
            inArray(products.id, idsProducto),
            eq(products.companyId, session.companyId)
          ));
        if (propios.length !== idsProducto.length) {
          return NextResponse.json(
            { success: false, error: { message: 'Uno o más productos no pertenecen a la empresa.' } },
            { status: 404 }
          );
        }
        for (const pr of propios) if (!pr.tracksInventory) sinInventario.add(pr.id);
      }
    }

    const result = await db.transaction(async (tx) => {
      // 1. Get the existing expense
      const existing = await tx
        .select()
        .from(expenses)
        .where(and(
          eq(expenses.id, id),
          eq(expenses.companyId, session.companyId),
          eq(expenses.modo, session.modo)
        ));

      if (existing.length === 0) {
        throw new Error('Compra/Gasto no encontrado');
      }

      // Auditoria P0-07 (2026-09-03): bloquear la edición si el período
      // contable ORIGINAL de esta compra ya está cerrado -- mismo motivo que
      // en DELETE (ver más abajo). Se comprueba contra la fecha YA GUARDADA,
      // no la que venga en el body: lo que hay que proteger es el período
      // donde el asiento actual ya vive, no el que el usuario esté a punto de
      // escribir.
      const periodoAbiertoOriginal = await AccountRepository.isPeriodOpen(session.companyId, existing[0].issueDate, session.modo, tx);
      if (!periodoAbiertoOriginal) {
        const err: any = new Error(
          `No se puede editar esta compra: su período contable original (fecha ${existing[0].issueDate}) ya está cerrado. ` +
          `Ábralo en Contabilidad > Períodos si de verdad necesita corregirla.`
        );
        err.status = 409;
        throw err;
      }

      // Auditoria P0-07 (2026-09-03): registrar el estado previo del asiento
      // ANTES de tocarlo, por el mismo motivo que en DELETE.
      const snapshotAsientosPut = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));
      const idsAsientosPut = snapshotAsientosPut.map((j: any) => j.id);
      const snapshotLineasAsientoPut = idsAsientosPut.length > 0
        ? await tx.select().from(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, idsAsientosPut))
        : [];

      await tx.insert(auditLogs).values({
        companyId: session.companyId,
        modo: session.modo,
        userId: session.userId,
        action: 'update_expense',
        entityType: 'expenses',
        entityId: id,
        oldValues: {
          expense: existing[0],
          journalEntries: snapshotAsientosPut,
          journalEntryLines: snapshotLineasAsientoPut,
        },
        newValues: { requestBody: body },
        ipAddress: ip,
      });

      // Check if there is an associated accountsPayable record and if it has any applied payments
      const [existingApRecord] = await tx
        .select({ id: accountsPayable.id })
        .from(accountsPayable)
        .where(and(
          eq(accountsPayable.id, id),
          eq(accountsPayable.companyId, session.companyId),
          eq(accountsPayable.modo, session.modo)
        ))
        .limit(1);

      let targetApId = id;
      if (!existingApRecord && supplierId && amount !== undefined) {
        const [foundByMatch] = await tx
          .select({ id: accountsPayable.id })
          .from(accountsPayable)
          .where(and(
            eq(accountsPayable.supplierId, supplierId),
            eq(accountsPayable.amount, amount.toString()),
            eq(accountsPayable.companyId, session.companyId),
            eq(accountsPayable.modo, session.modo),
            isNull(accountsPayable.deletedAt)
          ))
          .limit(1);
        if (foundByMatch) {
          targetApId = foundByMatch.id;
        }
      }

      if (existingApRecord || targetApId !== id) {
        const checkApId = existingApRecord ? existingApRecord.id : targetApId;
        // Estas dos guardas van acotadas por empresa pero NO por entorno, y
        // es deliberado. Son comprobaciones de SEGURIDAD: impiden editar una
        // compra que ya tiene pagos aplicados o un cheque cobrado. Filtrar por
        // modo aqui las debilitaria -- un pago heredado con el sello
        // equivocado dejaria de verse y la edicion pasaria. El id de la cuenta
        // por pagar ya acota lo que hay que acotar.
        const appliedPaymentsList = await tx
          .select()
          .from(apPayments)
          .where(and(
            eq(apPayments.apId, checkApId),
            eq(apPayments.companyId, session.companyId),
            eq(apPayments.status, 'applied')
          ));

        if (appliedPaymentsList.length > 0) {
          throw new Error('No se puede editar esta compra porque ya tiene pagos aplicados. Debe anular o eliminar los pagos asociados en Cuentas por Pagar primero.');
        }

        const clearedChecksList = await tx
          .select()
          .from(checks)
          .where(and(
            eq(checks.apId, checkApId),
            eq(checks.companyId, session.companyId),
            eq(checks.isGuarantee, true),
            eq(checks.status, 'cleared')
          ));

        if (clearedChecksList.length > 0) {
          throw new Error('No se puede editar esta compra porque el cheque en garantía ya fue cobrado en el banco. Debe anular la conciliación o cobro del cheque primero.');
        }
      }

      const oldWarehouseId = existing[0].warehouseId;

      // 2. Get the old expense lines
      const oldLines = await tx
        .select({ productId: expenseLines.productId, quantity: expenseLines.quantity })
        .from(expenseLines)
        .where(eq(expenseLines.expenseId, id));

      // 3. Revert old inventory levels if old warehouse is defined
      if (oldWarehouseId) {
        for (const line of oldLines) {
          if (line.productId) {
            const qty = parseFloat(line.quantity) || 0;
              // Auditoria INV-19: el filtro por empresa es obligatorio.
              // productId y warehouseId llegan del cuerpo de la peticion; sin
              // el, esta lectura podia resolver la existencia del almacen de
              // OTRA empresa y anclar el UPDATE a esa fila. El POST y el DELETE
              // ya lo llevaban; el PUT se quedo sin la correccion.
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.companyId, session.companyId),
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, oldWarehouseId),
                eq(inventoryLevels.modo, session.modo)
              ));
            
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              const balanceAfter = Math.max(0, currentBalance - qty);
              await tx
                .update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(eq(inventoryLevels.id, levelResult[0].id));
            }
          }
        }
      }

      // 4. Delete old inventory movements
      await tx
        .delete(inventoryMovements)
        .where(and(eq(inventoryMovements.referenceId, id), eq(inventoryMovements.companyId, session.companyId), eq(inventoryMovements.modo, session.modo)));

      // 5. Revertir (no borrar) los asientos contables previos de esta
      // compra -- misma técnica que DELETE (ver `revertirAsientoContable` al
      // inicio del archivo). El original queda intacto; la reversión deja el
      // efecto neto en cero. Justo después, este mismo PUT crea el asiento
      // NUEVO con los datos editados (más abajo, vía `AccountRepository.createJournalEntry`),
      // que ya pasa otra vez por `isPeriodOpen` y por la validación de
      // cuentas (P0-05).
      for (const je of snapshotAsientosPut) {
        await revertirAsientoContable(
          tx,
          session.companyId,
          session.modo,
          je.id,
          `Edición de compra NCF: ${existing[0].ncf || 'N/A'}`,
          session.userId
        );
      }

      // 6. Delete old expense lines
      await tx
        .delete(expenseLines)
        .where(eq(expenseLines.expenseId, id));

      // 7. Update Expense Header
      await tx
        .update(expenses)
        .set({
          warehouseId: warehouseId || null,
          supplierId: supplierId || null,
          expenseType,
          isMinorExpense: isMinorExpense || false,
          ncf: ncf ? ncf.toUpperCase().trim() : null,
          ncfModified: ncfModified || null,
          issueDate: new Date(issueDate).toISOString().split('T')[0],
          paymentDate: paymentDate ? new Date(paymentDate).toISOString().split('T')[0] : null,
          amount: amount.toString(),
          itbis: (itbis || 0).toString(),
          itbisRetained: (itbisRetained || 0).toString(),
          itbisProportionality: (itbisProportionality || 0).toString(),
          isrRetained: (isrRetained || 0).toString(),
          isc: (isc || 0).toString(),
          otherTaxes: (otherTaxes || 0).toString(),
          tip: (tip || 0).toString(),
          paymentMethod,
          description: description || null,
          updatedAt: new Date()
        })
        .where(eq(expenses.id, id));

      // 8. Insert New Lines & Update Inventory
      const hasInventory = !!(warehouseId && lines && lines.length > 0);
      if (lines && lines.length > 0) {
        for (const line of lines) {
          const lineId = uuidv4();
          await tx.insert(expenseLines).values({
            id: lineId,
            expenseId: id,
            productId: line.productId || null,
            description: line.description || 'Gasto/Servicio',
            quantity: line.quantity.toString(),
            unitCost: line.unitCost.toString(),
            subtotal: line.subtotal.toString(),
            itbis: (line.itbis || 0).toString(),
            total: line.total.toString(),
          });

          // Los servicios y la mercancia por encargo no mueven existencia.
          if (line.productId && warehouseId && !sinInventario.has(line.productId)) {
            const qty = parseFloat(line.quantity) || 0;
              // Auditoria INV-19: el filtro por empresa es obligatorio.
              // productId y warehouseId llegan del cuerpo de la peticion; sin
              // el, esta lectura podia resolver la existencia del almacen de
              // OTRA empresa y anclar el UPDATE a esa fila. El POST y el DELETE
              // ya lo llevaban; el PUT se quedo sin la correccion.
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.companyId, session.companyId),
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, warehouseId),
                eq(inventoryLevels.modo, session.modo)
              ));
            
            let balanceAfter = qty;
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              balanceAfter = currentBalance + qty;
              await tx
                .update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(eq(inventoryLevels.id, levelResult[0].id));
            } else {
              await tx.insert(inventoryLevels).values({
                id: uuidv4(),
                companyId: session.companyId,
                modo: session.modo,
                productId: line.productId,
                warehouseId: warehouseId,
                quantity: qty.toString(),
              });
            }

            // Record Movement
            await tx.insert(inventoryMovements).values({
              id: uuidv4(),
              companyId: session.companyId,
              modo: session.modo,
              productId: line.productId,
              warehouseId: warehouseId,
              userId: session.userId,
              type: 'purchase',
              quantity: qty.toString(),
              balanceAfter: balanceAfter.toString(),
              referenceId: id,
              description: `Edición de Compra a suplidor / Gasto`
            });
          }
        }
      }

      // 8.5. Accounts Payable (CXP) & Guarantee Check Synchronization
      const isCredit = paymentMethod === '04';
      const apId = id; // Use the expense ID as the accounts_payable ID

      if (isCredit && supplierId) {
        const apBalanceVal = (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0));

        // Try to find if an accounts_payable entry already exists (by expense ID or matching details)
        let [existingAp] = await tx
          .select()
          .from(accountsPayable)
          .where(and(
            eq(accountsPayable.id, apId),
            eq(accountsPayable.companyId, session.companyId),
            eq(accountsPayable.modo, session.modo)
          ));

        // If not found by direct ID (backward compatibility), try to locate it by matching details
        if (!existingAp) {
          const [foundByMatch] = await tx
            .select()
            .from(accountsPayable)
            .where(and(
              eq(accountsPayable.supplierId, supplierId),
              eq(accountsPayable.amount, amount.toString()),
              eq(accountsPayable.companyId, session.companyId),
              eq(accountsPayable.modo, session.modo),
              isNull(accountsPayable.deletedAt)
            ))
            .limit(1);
          existingAp = foundByMatch;
        }

        if (existingAp) {
          // Update existing Accounts Payable record
          await tx
            .update(accountsPayable)
            .set({
              supplierId,
              amount: apBalanceVal.toString(), // Store the total original debt amount (with taxes)
              balance: apBalanceVal.toString(),
              dueDate: paymentDate ? new Date(paymentDate).toISOString().split('T')[0] : (() => {
              const parts = issueDate.split('-');
              if (parts.length === 3) {
                const [y, m, d] = parts.map(Number);
                const date = new Date(Date.UTC(y, m - 1, d));
                date.setUTCMonth(date.getUTCMonth() + 1);
                return date.toISOString().split('T')[0];
              }
              const date = new Date();
              date.setMonth(date.getMonth() + 1);
              return date.toISOString().split('T')[0];
              })(),
              status: 'pending',
              expenseId: id,
              updatedAt: new Date()
            })
            .where(and(eq(accountsPayable.id, existingAp.id), eq(accountsPayable.companyId, session.companyId), eq(accountsPayable.modo, session.modo)));
        } else {
          // Create new Accounts Payable record
          await tx.insert(accountsPayable).values({
            id: apId,
            companyId: session.companyId,
            modo: session.modo,
            supplierId: supplierId,
            amount: apBalanceVal.toString(), // Store the total original debt amount (with taxes)
            balance: apBalanceVal.toString(),
            dueDate: paymentDate ? new Date(paymentDate).toISOString().split('T')[0] : (() => {
              const parts = issueDate.split('-');
              if (parts.length === 3) {
                const [y, m, d] = parts.map(Number);
                const date = new Date(Date.UTC(y, m - 1, d));
                date.setUTCMonth(date.getUTCMonth() + 1);
                return date.toISOString().split('T')[0];
              }
              const date = new Date();
              date.setMonth(date.getMonth() + 1);
              return date.toISOString().split('T')[0];
            })(),
            status: 'pending',
            expenseId: id,
          });
        }

        // Get the active AP ID
        const activeApId = existingAp ? existingAp.id : apId;

        // Process guarantee check
        if (guaranteeCheck) {
          const checkAmount = parseFloat(guaranteeCheck.amount) || apBalanceVal;

          // Check if a guarantee check already exists for this AP record
          let [existingCheck] = await tx
            .select()
            .from(checks)
            .where(and(
              eq(checks.apId, activeApId),
              eq(checks.isGuarantee, true),
              eq(checks.companyId, session.companyId),
              eq(checks.modo, session.modo)
            ))
            .limit(1);

          // If not found by AP ID, check by check number (backward compatibility & unique index constraint safety)
          if (!existingCheck && guaranteeCheck.checkNumber) {
            const [foundByNum] = await tx
              .select()
              .from(checks)
              .where(and(
                eq(checks.checkNumber, guaranteeCheck.checkNumber),
                eq(checks.isGuarantee, true),
                eq(checks.companyId, session.companyId),
                eq(checks.modo, session.modo)
              ))
              .limit(1);
            existingCheck = foundByNum;
          }

          if (existingCheck) {
            // Update existing guarantee check
            await tx
              .update(checks)
              .set({
                bankAccountId: guaranteeCheck.bankAccountId,
                checkNumber: guaranteeCheck.checkNumber,
                payee: guaranteeCheck.payee || 'Proveedor',
                amount: checkAmount.toString(),
                issueDate: guaranteeCheck.issueDate ? new Date(guaranteeCheck.issueDate).toISOString().split('T')[0] : new Date(issueDate).toISOString().split('T')[0],
                dueDate: new Date(guaranteeCheck.dueDate).toISOString().split('T')[0],
                apId: activeApId,
                updatedAt: new Date()
              })
              .where(eq(checks.id, existingCheck.id));

            // Update corresponding apPayment if exists
            await tx
              .update(apPayments)
              .set({
                amount: checkAmount.toString(),
                paymentDate: guaranteeCheck.issueDate ? new Date(guaranteeCheck.issueDate).toISOString().split('T')[0] : new Date(issueDate).toISOString().split('T')[0],
              })
              .where(and(eq(apPayments.checkId, existingCheck.id), eq(apPayments.companyId, session.companyId), eq(apPayments.modo, session.modo)));
          } else {
            // Create new guarantee check
            const checkId = uuidv4();
            await tx.insert(checks).values({
              id: checkId,
              companyId: session.companyId,
              modo: session.modo,
              bankAccountId: guaranteeCheck.bankAccountId,
              checkNumber: guaranteeCheck.checkNumber,
              payee: guaranteeCheck.payee || 'Proveedor',
              amount: checkAmount.toString(),
              issueDate: guaranteeCheck.issueDate ? new Date(guaranteeCheck.issueDate).toISOString().split('T')[0] : new Date(issueDate).toISOString().split('T')[0],
              dueDate: new Date(guaranteeCheck.dueDate).toISOString().split('T')[0],
              isGuarantee: true,
              apId: activeApId,
              status: 'pending',
            });

            // Cuentas del pago diferido.
            //
            // Auditoria ARP-02. Aqui estaba el origen de los ocho cheques en
            // garantia que acabaron acreditando CUENTAS POR COBRAR: el codigo
            // pedia '1.1.02' llamandolo "Efectivo en Bancos" -- nombre heredado
            // de un plan de tres niveles -- y `getOrCreateAccount` busca por
            // codigo e ignora el nombre. En el catalogo real, 1.1.02 es Cuentas
            // por Cobrar. Y '2.1.01' es la cuenta de AGRUPACION de proveedores,
            // no su hija transaccional.
            //
            // El asiento no se crea aqui, sino al cobrarse el cheque, con estas
            // dos cuentas tal como queden guardadas. Por eso importan tanto.
            const accBank = await resolverCuentaDeBanco(
              tx, session.companyId, guaranteeCheck.bankAccountId, 'Cheque en garantía'
            );
            const accAp = await resolverCuentaPorPagar(tx, session.companyId, 'Cheque en garantía');

            await tx.insert(apPayments).values({
              id: uuidv4(),
              companyId: session.companyId,
              modo: session.modo,
              apId: activeApId,
              amount: checkAmount.toString(),
              paymentMethod: 'check',
              checkId: checkId,
              debitAccountId: accAp.id,
              creditAccountId: accBank.id,
              paymentDate: guaranteeCheck.issueDate ? new Date(guaranteeCheck.issueDate).toISOString().split('T')[0] : new Date(issueDate).toISOString().split('T')[0],
              status: 'pending_guarantee',
            });
          }
        } else {
          // If no guarantee check is provided, delete any existing guarantee checks and payments for this AP
          const existingChecks = await tx
            .select({ id: checks.id })
            .from(checks)
            .where(and(
              eq(checks.apId, activeApId),
              eq(checks.isGuarantee, true),
              eq(checks.companyId, session.companyId),
              eq(checks.modo, session.modo)
            ));

          for (const chk of existingChecks) {
            await tx
              .delete(apPayments)
              .where(and(eq(apPayments.checkId, chk.id), eq(apPayments.companyId, session.companyId), eq(apPayments.modo, session.modo)));
            await tx
              .delete(checks)
              .where(and(eq(checks.id, chk.id), eq(checks.companyId, session.companyId), eq(checks.modo, session.modo)));
          }
        }
      } else {
        // If payment method is not credit or supplierId is missing, delete associated AP entries, checks, and payments
        // to avoid orphaned records
        let [existingAp] = await tx
          .select({ id: accountsPayable.id })
          .from(accountsPayable)
          .where(and(
            eq(accountsPayable.id, apId),
            eq(accountsPayable.companyId, session.companyId),
            eq(accountsPayable.modo, session.modo)
          ));

        if (!existingAp && supplierId) {
          const [foundByMatch] = await tx
            .select({ id: accountsPayable.id })
            .from(accountsPayable)
            .where(and(
              eq(accountsPayable.supplierId, supplierId),
              eq(accountsPayable.amount, amount.toString()),
              eq(accountsPayable.companyId, session.companyId),
              eq(accountsPayable.modo, session.modo),
              isNull(accountsPayable.deletedAt)
            ))
            .limit(1);
          existingAp = foundByMatch;
        }

        if (existingAp) {
          // Delete checks and apPayments
          const associatedChecks = await tx
            .select({ id: checks.id })
            .from(checks)
            .where(eq(checks.apId, existingAp.id));

          for (const chk of associatedChecks) {
            await tx
              .delete(apPayments)
              .where(and(eq(apPayments.checkId, chk.id), eq(apPayments.companyId, session.companyId), eq(apPayments.modo, session.modo)));
            await tx
              .delete(checks)
              .where(and(eq(checks.id, chk.id), eq(checks.companyId, session.companyId), eq(checks.modo, session.modo)));
          }

          // Delete accountsPayable record
          await tx
            .delete(accountsPayable)
            .where(and(eq(accountsPayable.id, existingAp.id), eq(accountsPayable.companyId, session.companyId), eq(accountsPayable.modo, session.modo)));
        }
      }

      // 9. Re-create accounting entries (asiento contable)
      const subtotalVal = parseFloat(amount);
      const itbisAmount = parseFloat(itbis || 0);
      const otherTaxesAmount = parseFloat(otherTaxes || 0);
      const isrRet = parseFloat(isrRetained || 0);
      const itbisRet = parseFloat(itbisRetained || 0);

      // Total net to pay: subtotal + itbis + otherTaxes - isrRet - itbisRet
      const netAmount = subtotalVal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;

      if (netAmount > 0) {
        const isCredit = paymentMethod === '04';

        let accDebit;
        if (debitAccountId) {
          const [customAcc] = await tx
            .select()
            .from(chartOfAccounts)
            .where(and(eq(chartOfAccounts.id, debitAccountId), eq(chartOfAccounts.companyId, session.companyId)));
          accDebit = customAcc;
        }

        // Auditoria P0-05 (2026-09-03): mismo arreglo que POST /expenses --
        // ver el comentario alli. `resolverCuentaPorMapeo` nunca crea y
        // siempre valida que la cuenta sea transaccional, activa y de esta
        // empresa.
        if (!accDebit) {
          accDebit = hasInventory
            ? await resolverCuentaPorMapeo(tx, session.companyId, 'purchase_inventory', '1.1.06', 'Compra - Inventario de Mercancía')
            : await resolverCuentaPorMapeo(tx, session.companyId, 'cost_of_goods_sold', '5.1.01', 'Compra - Costo de Ventas');
        }

        const accCredit = isCredit
          ? await resolverCuentaPorMapeo(tx, session.companyId, 'supplier_payable', '2.1.01.01', 'Compra - Cuentas por Pagar')
          : await resolverCuentaPorMapeo(tx, session.companyId, 'cash', '1.1.01.01', 'Compra - Efectivo');

        const journalLines = [
          { accountId: accDebit.id, debit: subtotalVal, credit: 0 },
        ];

        if (itbisAmount > 0) {
          const accItbisPagado = await resolverCuentaPorMapeo(tx, session.companyId, 'purchase_itbis_paid', '1.1.08', 'Compra - ITBIS Pagado');
          journalLines.push({ accountId: accItbisPagado.id, debit: itbisAmount, credit: 0 });
        }

        if (otherTaxesAmount > 0) {
          const accOtrosImp = await resolverCuentaPorMapeo(tx, session.companyId, 'purchase_other_taxes', '5.1.02', 'Compra - Otros Impuestos y Tasas');
          journalLines.push({ accountId: accOtrosImp.id, debit: otherTaxesAmount, credit: 0 });
        }

        journalLines.push({ accountId: accCredit.id, debit: 0, credit: netAmount });

        if (isrRet > 0) {
          const accIsrRet = await resolverCuentaPorMapeo(tx, session.companyId, 'isr_withholding_payable', '2.1.04', 'Compra - ISR Retenido por Pagar');
          journalLines.push({ accountId: accIsrRet.id, debit: 0, credit: isrRet });
        }

        if (itbisRet > 0) {
          const accItbisRet = await resolverCuentaPorMapeo(tx, session.companyId, 'itbis_withholding_payable', '2.1.05', 'Compra - ITBIS Retenido por Pagar');
          journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: itbisRet });
        }

        await AccountRepository.createJournalEntry(tx, {
          companyId: session.companyId,
          modo: session.modo,
          reference: id,
          date: new Date(issueDate),
          description: `Asiento Automático de Compra NCF: ${ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'} (Editado)`,
          lines: journalLines,
          // Auditoria JRN-16: quien registra el asiento.
          createdBy: session.userId,
        });
      }

      return { id };
    });

    return NextResponse.json({ success: true, message: 'Compra/Gasto editado y registros contables actualizados exitosamente', data: result });
  } catch (err: any) {
    console.error('Error editing expense:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
