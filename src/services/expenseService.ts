// src/services/expenseService.ts
import { eq, and, between, isNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import { expenses, expenseLines, suppliers, companies } from '../db/schema';
import { txtDel606, type Compra606 } from './dgii/formato606';
import { accountsPayable } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { addStock } from './inventoryService';
import { AccountRepository } from '../repositories/accountRepository';
import { resolverCuentaPorMapeo, resolverCuentaDeInventario } from './accounting/resolverCuentas';
import { FinancialMovementService } from '@/services/financialMovementService';
import { ultimoDiaDelMes } from '@/utils/fechasLocales';
import { efectoEnCajaDeDocumento, reflejarEnCaja } from '@/services/caja/efectivoDeCaja';
import { efectoEnCuentaDeDocumento } from '@/services/contabilidad/efectoEnCuenta';
import { resolverOrigenDeCompra } from '@/services/cxp/resolverOrigenDeCompra';
import { reflejarEnBancoDeCompra } from '@/services/cxp/bancoDeLaCompra';

// Auditoria P0-05 (2026-09-03): `getOrCreateAccount` vivia aqui -- eliminado.
// Creaba cuentas sobre la marcha sin `nature`/`level` correctos, y no
// distinguia una cuenta de agrupacion ('2.1.01', '1.1.01') de su hija
// transaccional. Las cuentas de este modulo se resuelven ahora con
// `resolverCuentaPorMapeo` (services/accounting/resolverCuentas.ts), que
// nunca crea y siempre valida.

/**
 * Creates a new expense record and automatically creates a corresponding
 * entry in `accounts_payable`.
 */
export async function createExpense(expenseData: {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  warehouseId?: string;
  supplierId: string;
  expenseType: string; // '01'..'11'
  ncf: string;
  ncfModified?: string;
  issueDate: string; // YYYY-MM-DD
  paymentDate?: string;
  amount: number;
  itbis?: number;
  itbisRetained?: number;
  itbisProportionality?: number;
  isrRetained?: number;
  isc?: number;
  otherTaxes?: number;
  tip?: number;
  paymentMethod: string; // '01' cash, '02' cheque, etc.
  userId?: string; // Required if updating inventory
  lines?: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
  debitAccountId?: string;
  // Lote 170: de donde sale el dinero cuando no es efectivo ni a credito.
  // Ver services/cxp/origenDeLaCompra.ts.
  paymentAccountId?: string | null;
  bankAccountId?: string | null;
}) {
  return await db.transaction(async (tx) => {
    // Lote 170: se valida ANTES de escribir nada, igual que en
    // `POST /api/v1/expenses`. Esta es la otra puerta a las compras (la usa el
    // POST del 606) y tiene que aplicar la misma regla: una compra por cheque,
    // transferencia o tarjeta no acredita la Caja General.
    const origen = await resolverOrigenDeCompra(tx, expenseData.companyId, expenseData.paymentMethod, {
      paymentAccountId: expenseData.paymentAccountId || null,
      bankAccountId: expenseData.bankAccountId || null,
    });

    // Insert expense
    const [expense] = await tx
      .insert(expenses)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        warehouseId: expenseData.warehouseId,
        supplierId: expenseData.supplierId,
        expenseType: expenseData.expenseType,
        ncf: expenseData.ncf,
        ncfModified: expenseData.ncfModified,
        issueDate: expenseData.issueDate,
        paymentDate: expenseData.paymentDate,
        amount: expenseData.amount.toString(),
        itbis: (expenseData.itbis ?? 0).toString(),
        itbisRetained: (expenseData.itbisRetained ?? 0).toString(),
        itbisProportionality: (expenseData.itbisProportionality ?? 0).toString(),
        isrRetained: (expenseData.isrRetained ?? 0).toString(),
        isc: (expenseData.isc ?? 0).toString(),
        otherTaxes: (expenseData.otherTaxes ?? 0).toString(),
        tip: (expenseData.tip ?? 0).toString(),
        paymentMethod: expenseData.paymentMethod,
        paymentAccountId: origen.cuentaQueAcredita,
        bankAccountId: origen.bankAccountId,
      })
      .returning();

    // Automatic CXP entry
    const isCredit = expenseData.paymentMethod === '04';
    await tx
      .insert(accountsPayable)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        supplierId: expenseData.supplierId,
        amount: expenseData.amount.toString(),
        balance: isCredit ? expenseData.amount.toString() : '0.00',
        dueDate: expenseData.paymentDate ?? expenseData.issueDate,
        status: isCredit ? 'pending' : 'paid',
        expenseId: expense.id,
      });

    // Financial movements registration (Suplidores)
    if (expenseData.supplierId) {
      await FinancialMovementService.registerMovement(tx, {
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        entityType: 'supplier',
        supplierId: expenseData.supplierId,
        date: expenseData.issueDate,
        movementType: 'invoice',
        documentId: expense.id,
        documentNumber: expenseData.ncf || 'Sin NCF',
        originModule: 'purchases',
        debit: 0,
        credit: expenseData.amount,
        userId: expenseData.userId,
        notes: `Compra de bienes/servicios registrada. NCF: ${expenseData.ncf || 'Sin NCF'}`,
      });

      // Rule: If cash purchase, generate matching immediate payment movement
      if (!isCredit) {
        await FinancialMovementService.registerMovement(tx, {
          companyId: expenseData.companyId,
          modo: expenseData.modo,
          entityType: 'supplier',
          supplierId: expenseData.supplierId,
          date: expenseData.issueDate,
          movementType: 'payment',
          documentId: expense.id,
          documentNumber: `PAG-CASH-${expenseData.ncf || expense.id.slice(0, 8)}`,
          originModule: expenseData.paymentMethod === '01' ? 'cash' : 'bank',
          debit: expenseData.amount,
          credit: 0,
          userId: expenseData.userId,
          notes: `Pago inmediato al contado. NCF: ${expenseData.ncf || 'Sin NCF'}`,
        });
      }
    }

    // --- Journal Entry Generation (Asiento Contable) ---
    const subtotal = expenseData.amount;
    const itbisAmount = expenseData.itbis ?? 0;
    const otherTaxesAmount = expenseData.otherTaxes ?? 0;
    const isrRet = expenseData.isrRetained ?? 0;
    const itbisRet = expenseData.itbisRetained ?? 0;

    // Total net: subtotal + itbis + otherTaxes - isrRet - itbisRet
    const netAmount = subtotal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;

    if (netAmount > 0) {
      // 1. Get/create accounts
      // Auditoria P0-05 (2026-09-03): mismo arreglo que expenses/route.ts --
      // `resolverCuentaPorMapeo` nunca crea y siempre valida que la cuenta
      // sea transaccional, activa y de esta empresa. El override manual
      // (`expenseData.debitAccountId`) se conserva tal cual: sigue sin
      // validar aqui que pertenezca a la empresa, igual que antes -- eso
      // queda fuera del alcance de este arreglo.
      const hasInventory = !!(expenseData.warehouseId && expenseData.lines && expenseData.lines.length > 0);
      const accDebit = expenseData.debitAccountId
        ? { id: expenseData.debitAccountId }
        : (hasInventory 
          // La MISMA cuenta de la que sale el costo de venta. Ver
          // resolverCuentaDeInventario: con `purchase_inventory`/1.1.06 eran dos.
          ? await resolverCuentaDeInventario(tx, expenseData.companyId, 'Compra - Inventario de Mercancía')
          : await resolverCuentaPorMapeo(tx, expenseData.companyId, 'cost_of_goods_sold', '5.1.01', 'Compra - Costo de Ventas'));

      // Lote 170: al contado ya no es siempre la CAJA -- acredita la cuenta
      // del origen elegido (el banco, o la cuenta por pagar de la tarjeta).
      const accCredit = isCredit
        ? await resolverCuentaPorMapeo(tx, expenseData.companyId, 'supplier_payable', '2.1.01.01', 'Compra - Cuentas por Pagar')
        : origen.cuentaQueAcredita
          ? { id: origen.cuentaQueAcredita }
          : await resolverCuentaPorMapeo(tx, expenseData.companyId, 'cash', '1.1.01.01', 'Compra - Efectivo');

      const journalLines = [
        // Debit the subtotal/cost
        { accountId: accDebit.id, debit: subtotal, credit: 0 },
      ];

      // Debit the ITBIS Pagado if any
      if (itbisAmount > 0) {
        const accItbisPagado = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'purchase_itbis_paid', '1.1.04.01', 'Compra - ITBIS Pagado');
        journalLines.push({ accountId: accItbisPagado.id, debit: itbisAmount, credit: 0 });
      }

      // Debit other taxes if any
      if (otherTaxesAmount > 0) {
        const accOtrosImp = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'purchase_other_taxes', '5.1.02', 'Compra - Otros Impuestos y Tasas');
        journalLines.push({ accountId: accOtrosImp.id, debit: otherTaxesAmount, credit: 0 });
      }

      // Credit the net paid/payable
      journalLines.push({ accountId: accCredit.id, debit: 0, credit: netAmount });

      // Credit the Retained ISR if any
      if (isrRet > 0) {
        const accIsrRet = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'isr_withholding_payable', '2.1.02.03', 'Compra - ISR Retenido por Pagar');
        journalLines.push({ accountId: accIsrRet.id, debit: 0, credit: isrRet });
      }

      // Credit the Retained ITBIS if any
      if (itbisRet > 0) {
        const accItbisRet = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'itbis_withholding_payable', '2.1.02.02', 'Compra - ITBIS Retenido por Pagar');
        journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: itbisRet });
      }

      // Create the journal entry
      await AccountRepository.createJournalEntry(tx, {
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        reference: expense.id,
        date: expenseData.issueDate,
        description: `Asiento Automático de Compra NCF: ${expenseData.ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'}`,
        lines: journalLines,
        // Auditoria JRN-16: quien registra el asiento.
        createdBy: expenseData.userId || null,
      });
    }

    // Lote 169: lo que el asiento saco de la Caja General sale tambien de la
    // sesion de caja abierta. SOLO el metodo '01' (efectivo): ver el comentario
    // largo en `app/api/v1/expenses/route.ts`.
    if (expenseData.paymentMethod === '01') await reflejarEnCaja(tx, {
      companyId: expenseData.companyId,
      modo: expenseData.modo,
      userId: expenseData.userId,
      referencia: expense.id,
      descripcion: `Compra en efectivo NCF: ${expenseData.ncf || 'N/A'}`,
      cambioEnCaja: await efectoEnCajaDeDocumento(tx, expenseData.companyId, expenseData.modo, expense.id),
    });

    // Lote 170: y si salio de un banco, el retiro queda en SU libro, pendiente
    // de conciliar (mismo criterio que el pago a suplidor del lote 163).
    if (origen.bankAccountId) {
      const acredita = origen.cuentaQueAcredita!;
      await reflejarEnBancoDeCompra(tx, {
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        bankAccountId: origen.bankAccountId,
        referencia: expenseData.ncf ? `COM-${expenseData.ncf}` : `COM-${expense.id.slice(0, 8)}`,
        descripcion: `Compra NCF: ${expenseData.ncf || 'N/A'}`,
        fecha: expenseData.issueDate,
        cambioEnCuenta: await efectoEnCuentaDeDocumento(tx, expenseData.companyId, expenseData.modo, expense.id, acredita),
      });
    }

    // Update inventory if goods purchase
    if (expenseData.warehouseId && expenseData.lines && expenseData.userId) {
      // For expenseType '09' (Compras y Gastos que formarán parte del costo de venta) or similar
      for (const line of expenseData.lines) {
        // Auditoria P1-12 (2026-09-05): `line.unitPrice` funde su valor en el
        // costo promedio ponderado del producto/almacen. Si no viene (0 o
        // sin definir), la cantidad se mueve igual pero el promedio no
        // cambia -- mismo criterio que la recepcion de pedidos sin costo.
        await addStock(
          expenseData.companyId,
          expenseData.modo,
          line.productId,
          expenseData.warehouseId,
          line.quantity,
          expenseData.userId,
          'purchase',
          expense.id,
          `Compra según NCF ${expenseData.ncf}`,
          line.unitPrice || undefined,
          tx
        );
      }
    }

    return expense;
  });
}

/** Fetch expenses for a company within a month (YYYY-MM) */
export async function getExpenses(companyId: string, period: string, modo: 'PRODUCCION' | 'PRUEBA') {
  // El cierre del mes era `${year}-${month}-31` a pelo. `issue_date` es columna
  // `date`, asi que en los meses de 30 dias y en febrero ese literal no es una
  // fecha y Postgres RECHAZA LA CONSULTA ENTERA: "date/time field value out of
  // range". No devolvia de menos, reventaba. Comprobado contra la base el
  // 2026-09-15: el 606 del mes en curso (septiembre, 30 dias) daba 500.
  const end = ultimoDiaDelMes(period);
  if (!end) throw new Error(`Periodo invalido: ${period} (se espera AAAA-MM)`);
  const start = `${end.slice(0, 8)}01`;
  return await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        // `modo` tiene DEFAULT 'PRODUCCION': sin este filtro el 606 y el TXT que
        // se remite a la DGII incluian las compras registradas en PRUEBA, con su
        // NCF y su monto, indistinguibles de las reales. Es parametro
        // obligatorio para que ninguna llamada nueva pueda olvidarlo.
        eq(expenses.modo, modo),
        between(expenses.issueDate, start, end),
        // Lote 144: una compra borrada no es una compra. Entraba en el listado
        // del 606 y en su TXT. Medido el 2026-09-16: cero borradas hoy.
        isNull(expenses.deletedAt)
      )
    );
}

/**
 * El contenido del TXT del 606 del periodo.
 *
 * Lote 144: el fichero no cumplia el Anexo A de la NG 07-2018 en nada --
 * cabecera sin RNC ni cantidad, detalle de ancho fijo sin separadores y con
 * siete datos donde van 23, importes sin punto decimal. Lo arma ahora
 * `dgii/formato606.ts`, donde estan escritas tambien las decisiones sobre las
 * compras sin NCF, el reparto servicios/bienes y la fecha de pago.
 */
export async function generate606Txt(companyId: string, period: string, modo: 'PRODUCCION' | 'PRUEBA') {
  const rows = await getExpenses(companyId, period, modo);

  const rncEmisor = await rncDeLaEmpresa(companyId);
  if (!rncEmisor) throw new Error('Empresa no encontrada.');

  // RNC de cada proveedor y lineas de cada compra, en una consulta cada uno.
  const idsProveedor = [...new Set(rows.map((e) => e.supplierId).filter((id): id is string => !!id))];
  const rncs = idsProveedor.length === 0 ? [] : await db
    .select({ id: suppliers.id, rnc: suppliers.rnc })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), inArray(suppliers.id, idsProveedor)));
  const rncDe = new Map(rncs.map((s) => [s.id, s.rnc]));

  const idsCompra = rows.map((e) => e.id);
  const lineas = idsCompra.length === 0 ? [] : await db
    .select({ expenseId: expenseLines.expenseId, productId: expenseLines.productId, subtotal: expenseLines.subtotal })
    .from(expenseLines)
    .where(inArray(expenseLines.expenseId, idsCompra));

  const compras: Compra606[] = rows.map((e) => ({
    ncf: e.ncf,
    ncfModified: e.ncfModified,
    supplierRnc: e.supplierId ? rncDe.get(e.supplierId) ?? null : null,
    expenseType: e.expenseType,
    issueDate: e.issueDate,
    paymentDate: e.paymentDate,
    paymentMethod: e.paymentMethod,
    amount: e.amount,
    itbis: e.itbis,
    itbisRetained: e.itbisRetained,
    itbisProportionality: e.itbisProportionality,
    isrRetained: e.isrRetained,
    isc: e.isc,
    otherTaxes: e.otherTaxes,
    tip: e.tip,
    lineas: lineas.filter((l) => l.expenseId === e.id),
  }));

  return txtDel606({ rncEmisor, periodo: period, compras });
}

/** El RNC de la empresa, para el nombre del fichero. */
export async function rncDeLaEmpresa(companyId: string): Promise<string | null> {
  const [empresa] = await db.select({ rnc: companies.rnc }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return empresa?.rnc ?? null;
}

