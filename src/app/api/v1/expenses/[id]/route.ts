import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, suppliers, warehouses } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { eq, and } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';

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

    return NextResponse.json({
      success: true,
      data: {
        ...expenseResult[0],
        lines
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

    if (!isAdminOrSistemas(session.role)) {
      return NextResponse.json({ success: false, error: { message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' } }, { status: 403 });
    }

    const { id } = await params;

    // Delete the expense (will cascade delete expenseLines if DDL configured cascade, or we do it transactionally)
    // Note: cascade is defined in the DDL constraint 'expense_lines_expense_id_expenses_id_fk'
    const deleted = await db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Gasto/Compra no encontrado o no autorizado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Compra/Gasto eliminado exitosamente' });
  } catch (err: any) {
    console.error('Error deleting expense:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
