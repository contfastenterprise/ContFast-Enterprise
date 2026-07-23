import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, inventoryLevels, inventoryMovements, accountsPayable, users, suppliers, warehouses, chartOfAccounts, checks, apPayments } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { eq, sql, and, between } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AccountRepository } from '@/repositories/accountRepository';
import { checkRateLimit } from '@/middleware/rateLimiter';

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

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'proveedores', 'write');

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
      guaranteeCheck,
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
    } else {
      if (ncf && ncf.trim().length > 0) {
        return NextResponse.json({ success: false, error: { message: 'Esta compra no puede guardarse como gasto menor ya que tiene e-NCF' } }, { status: 400 });
      }
    }

    const result = await db.transaction(async (tx) => {
      // 1. Insert Expense header
      const newExpenseId = uuidv4();
      
      await tx.insert(expenses).values({
        id: newExpenseId,
        companyId: session.companyId,
        modo: session.modo,
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
        description: description || null
      });

      // 2. Insert Lines & Update Inventory
      const hasInventory = !!(warehouseId && lines && lines.length > 0);
      if (lines && lines.length > 0) {
        for (const line of lines) {
          const lineId = uuidv4();
          await tx.insert(expenseLines).values({
            id: lineId,
            expenseId: newExpenseId,
            productId: line.productId || null,
            description: line.description || 'Gasto/Servicio',
            quantity: line.quantity.toString(),
            unitCost: line.unitCost.toString(),
            subtotal: line.subtotal.toString(),
            itbis: (line.itbis || 0).toString(),
            total: line.total.toString(),
          });

          // 3. Update Inventory if product and warehouse specified
          if (line.productId && warehouseId) {
            const qty = parseFloat(line.quantity);

            // Fetch current level
            const levelResult = await tx.select({ balance: inventoryLevels.quantity })
              .from(inventoryLevels)
              .where(and(
                eq(inventoryLevels.productId, line.productId),
                eq(inventoryLevels.warehouseId, warehouseId),
                eq(inventoryLevels.modo, session.modo)
              ));
            
            let balanceAfter = qty;
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              balanceAfter = currentBalance + qty;
              await tx.update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(and(
                  eq(inventoryLevels.productId, line.productId),
                  eq(inventoryLevels.warehouseId, warehouseId),
                  eq(inventoryLevels.modo, session.modo)
                ));
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
              referenceId: newExpenseId,
              description: `Compra a suplidor / Gasto`
            });
          }
        }
      }

      // 4. Accounts Payable (if Credit -> Payment Method '04')
      if (paymentMethod === '04' && supplierId) {
        const apId = newExpenseId;
        const apBalanceVal = (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0));
        
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
              date.setUTCDate(date.getUTCDate() + 30);
              return date.toISOString().split('T')[0];
            }
            const date = new Date();
            date.setDate(date.getDate() + 30);
            return date.toISOString().split('T')[0];
          })(),
          status: 'pending',
        });

        // 4b. Create Guarantee Check & Pending Payment if present
        if (guaranteeCheck) {
          const checkId = uuidv4();
          const checkAmount = parseFloat(guaranteeCheck.amount) || apBalanceVal;

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
            apId: apId,
            status: 'pending',
          });

          const accAp = await getOrCreateAccount(tx, session.companyId, '2.1.01', 'Cuentas por Pagar', 'liability');
          const accBank = await getOrCreateAccount(tx, session.companyId, '1.1.02', 'Efectivo en Bancos', 'asset');

          await tx.insert(apPayments).values({
            id: uuidv4(),
            companyId: session.companyId,
            modo: session.modo,
            apId: apId,
            amount: checkAmount.toString(),
            paymentMethod: 'check',
            checkId: checkId,
            debitAccountId: accAp.id,
            creditAccountId: accBank.id,
            paymentDate: guaranteeCheck.issueDate ? new Date(guaranteeCheck.issueDate).toISOString().split('T')[0] : new Date(issueDate).toISOString().split('T')[0],
            status: 'pending_guarantee',
          });
        }
      }

      // 5. Journal Entry Generation (Asiento Contable)
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
          modo: session.modo,
          reference: newExpenseId,
          date: new Date(issueDate),
          description: `Asiento Automático de Compra NCF: ${ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'}`,
          lines: journalLines,
        });
      }

      return { id: newExpenseId };
    });

    return NextResponse.json({ success: true, data: result }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error creating expense:', err);
    const status = err.status || 500;
    return NextResponse.json({ success: false, error: { message: err.message } }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'proveedores', 'read');

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isMinorExpenseStr = searchParams.get('isMinorExpense'); // 'true' or 'false'
    const expenseType = searchParams.get('expenseType');
    const supplierId = searchParams.get('supplierId');
    const warehouseId = searchParams.get('warehouseId');
    const ncf = searchParams.get('ncf');

    const filters: any[] = [
      eq(expenses.companyId, session.companyId),
      eq(expenses.modo, session.modo)
    ];

    if (startDate && endDate) {
      filters.push(between(expenses.issueDate, startDate, endDate));
    } else if (startDate) {
      filters.push(sql`${expenses.issueDate} >= ${startDate}`);
    } else if (endDate) {
      filters.push(sql`${expenses.issueDate} <= ${endDate}`);
    }

    if (isMinorExpenseStr === 'true') {
      filters.push(eq(expenses.isMinorExpense, true));
    } else if (isMinorExpenseStr === 'false') {
      filters.push(eq(expenses.isMinorExpense, false));
    }

    if (expenseType) {
      filters.push(eq(expenses.expenseType, expenseType));
    }

    if (supplierId) {
      filters.push(eq(expenses.supplierId, supplierId));
    }

    if (warehouseId) {
      filters.push(eq(expenses.warehouseId, warehouseId));
    }

    if (ncf) {
      filters.push(sql`LOWER(${expenses.ncf}) LIKE ${'%' + ncf.toLowerCase() + '%'}`);
    }

    const data = await db
      .select({
        id: expenses.id,
        companyId: expenses.companyId,
        warehouseId: expenses.warehouseId,
        supplierId: expenses.supplierId,
        expenseType: expenses.expenseType,
        isMinorExpense: expenses.isMinorExpense,
        ncf: expenses.ncf,
        issueDate: expenses.issueDate,
        paymentDate: expenses.paymentDate,
        amount: expenses.amount,
        itbis: expenses.itbis,
        itbisRetained: expenses.itbisRetained,
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
      .where(and(...filters))
      .orderBy(sql`${expenses.issueDate} DESC, ${expenses.createdAt} DESC`);

    return NextResponse.json({ success: true, data }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error fetching expenses:', err);
    const status = err.status || 500;
    return NextResponse.json({ success: false, error: { message: err.message } }, { status });
  }
}

