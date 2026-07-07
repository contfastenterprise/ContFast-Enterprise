import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, suppliers, warehouses, journalEntries, journalEntryLines, inventoryMovements, inventoryLevels, chartOfAccounts } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { eq, and, sql } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { AccountRepository } from '@/repositories/accountRepository';
import { v4 as uuidv4 } from 'uuid';

async function getOrCreateAccount(tx: any, companyId: string, code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost') {
  const [acc] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));

  if (acc) return acc;

  const [newAcc] = await tx
    .insert(chartOfAccounts)
    .values({
      companyId,
      code,
      name,
      type,
      status: 'active',
    })
    .returning();

  return newAcc;
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
      .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)))
      .limit(1);

    if (expenseResult.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Gasto/Compra no encontrado' } }, { status: 404 });
    }

    const lines = await db
      .select()
      .from(expenseLines)
      .where(eq(expenseLines.expenseId, id));

    const jes = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)))
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

    return NextResponse.json({
      success: true,
      data: {
        ...expenseResult[0],
        lines,
        debitAccountId
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

    if (!session.role.toLowerCase().includes('sistema')) {
      return NextResponse.json({ success: false, error: { message: 'No tiene permisos para realizar esta acción. Solo usuarios de Sistemas pueden eliminar compras.' } }, { status: 403 });
    }

    const { id } = await params;

    const deleted = await db.transaction(async (tx) => {
      // 1. Get the expense header to verify ownership and get warehouseId
      const expHeaders = await tx
        .select({ id: expenses.id, warehouseId: expenses.warehouseId })
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)));

      if (expHeaders.length === 0) {
        return null;
      }

      const warehouseId = expHeaders[0].warehouseId;

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
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, warehouseId)
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
        .where(and(eq(inventoryMovements.referenceId, id), eq(inventoryMovements.companyId, session.companyId)));

      // 5. Delete accounting journal entries linked to this expense
      const jes = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));

      for (const je of jes) {
        // Delete lines first to satisfy foreign key constraints
        await tx
          .delete(journalEntryLines)
          .where(and(eq(journalEntryLines.journalEntryId, je.id), eq(journalEntryLines.companyId, session.companyId)));
        
        // Delete header
        await tx
          .delete(journalEntries)
          .where(and(eq(journalEntries.id, je.id), eq(journalEntries.companyId, session.companyId)));
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
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
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
      debitAccountId
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
    }

    const result = await db.transaction(async (tx) => {
      // 1. Get the existing expense
      const existing = await tx
        .select({ id: expenses.id, warehouseId: expenses.warehouseId })
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)));

      if (existing.length === 0) {
        throw new Error('Compra/Gasto no encontrado');
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
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, oldWarehouseId)
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
        .where(and(eq(inventoryMovements.referenceId, id), eq(inventoryMovements.companyId, session.companyId)));

      // 5. Delete old journal entries
      const jes = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.reference, id), eq(journalEntries.companyId, session.companyId)));

      for (const je of jes) {
        await tx
          .delete(journalEntryLines)
          .where(and(eq(journalEntryLines.journalEntryId, je.id), eq(journalEntryLines.companyId, session.companyId)));
        await tx
          .delete(journalEntries)
          .where(and(eq(journalEntries.id, je.id), eq(journalEntries.companyId, session.companyId)));
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

          if (line.productId && warehouseId) {
            const qty = parseFloat(line.quantity) || 0;
            const levelResult = await tx
              .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, warehouseId)
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
                productId: line.productId,
                warehouseId: warehouseId,
                quantity: qty.toString(),
              });
            }

            // Record Movement
            await tx.insert(inventoryMovements).values({
              id: uuidv4(),
              companyId: session.companyId,
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

        if (!accDebit) {
          accDebit = hasInventory
            ? await getOrCreateAccount(tx, session.companyId, '1.1.06', 'Inventario de Mercancía', 'asset')
            : await getOrCreateAccount(tx, session.companyId, '5.1.01', 'Costo de Ventas', 'cost');
        }

        const accCredit = isCredit
          ? await getOrCreateAccount(tx, session.companyId, '2.1.01', 'Cuentas por Pagar', 'liability')
          : await getOrCreateAccount(tx, session.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');

        const journalLines = [
          { accountId: accDebit.id, debit: subtotalVal, credit: 0 },
        ];

        if (itbisAmount > 0) {
          const accItbisPagado = await getOrCreateAccount(tx, session.companyId, '1.1.08', 'ITBIS Pagado en Compras', 'asset');
          journalLines.push({ accountId: accItbisPagado.id, debit: itbisAmount, credit: 0 });
        }

        if (otherTaxesAmount > 0) {
          const accOtrosImp = await getOrCreateAccount(tx, session.companyId, '5.1.02', 'Otros Impuestos y Tasas', 'expense');
          journalLines.push({ accountId: accOtrosImp.id, debit: otherTaxesAmount, credit: 0 });
        }

        journalLines.push({ accountId: accCredit.id, debit: 0, credit: netAmount });

        if (isrRet > 0) {
          const accIsrRet = await getOrCreateAccount(tx, session.companyId, '2.1.04', 'ISR Retenido por Pagar', 'liability');
          journalLines.push({ accountId: accIsrRet.id, debit: 0, credit: isrRet });
        }

        if (itbisRet > 0) {
          const accItbisRet = await getOrCreateAccount(tx, session.companyId, '2.1.05', 'ITBIS Retenido por Pagar', 'liability');
          journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: itbisRet });
        }

        await AccountRepository.createJournalEntry(tx, {
          companyId: session.companyId,
          reference: id,
          date: new Date(issueDate),
          description: `Asiento Automático de Compra NCF: ${ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'} (Editado)`,
          lines: journalLines,
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
