import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, inventoryLevels, inventoryMovements, accountsPayable, users, suppliers, warehouses } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { eq, sql, and, between } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

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
      lines // Array of { productId, description, quantity, unitCost, subtotal, itbis, total }
    } = body;

    // Validation
    if (!expenseType || !issueDate || amount === undefined || paymentMethod === undefined) {
      return NextResponse.json({ success: false, error: { message: 'Faltan campos requeridos.' } }, { status: 400 });
    }

    if (!isMinorExpense && !supplierId) {
      return NextResponse.json({ success: false, error: { message: 'Suplidor es requerido para compras formales.' } }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Insert Expense header
      const newExpenseId = uuidv4();
      
      await tx.insert(expenses).values({
        id: newExpenseId,
        companyId: session.companyId,
        warehouseId: warehouseId || null,
        supplierId: supplierId || null,
        expenseType,
        isMinorExpense: isMinorExpense || false,
        ncf: ncf || null,
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
                eq(inventoryLevels.warehouseId, warehouseId)
              ));
            
            let balanceAfter = qty;
            if (levelResult.length > 0) {
              const currentBalance = parseFloat(levelResult[0].balance);
              balanceAfter = currentBalance + qty;
              await tx.update(inventoryLevels)
                .set({ quantity: balanceAfter.toString(), updatedAt: new Date() })
                .where(and(
                  eq(inventoryLevels.productId, line.productId),
                  eq(inventoryLevels.warehouseId, warehouseId)
                ));
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
              referenceId: newExpenseId,
              description: `Compra a suplidor / Gasto`
            });
          }
        }
      }

      // 4. Accounts Payable (if Credit -> Payment Method '04')
      if (paymentMethod === '04' && supplierId) {
        await tx.insert(accountsPayable).values({
          id: uuidv4(),
          companyId: session.companyId,
          supplierId: supplierId,
          amount: amount.toString(), // Total with taxes ideally, but using amount + taxes
          balance: (parseFloat(amount) + parseFloat(itbis || 0) + parseFloat(otherTaxes || 0) - parseFloat(itbisRetained || 0) - parseFloat(isrRetained || 0)).toString(),
          dueDate: paymentDate ? new Date(paymentDate).toISOString().split('T')[0] : new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
          status: 'pending',
        });
      }

      return { id: newExpenseId };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Error creating expense:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isMinorExpenseStr = searchParams.get('isMinorExpense'); // 'true' or 'false'
    const expenseType = searchParams.get('expenseType');
    const supplierId = searchParams.get('supplierId');
    const warehouseId = searchParams.get('warehouseId');
    const ncf = searchParams.get('ncf');

    const filters: any[] = [eq(expenses.companyId, session.companyId)];

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

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('Error fetching expenses:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

