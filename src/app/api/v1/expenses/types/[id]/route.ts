import { NextRequest, NextResponse } from 'next/server';
import { db, expenseTypes } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { eq, and } from 'drizzle-orm';
import { delCache } from '@/infrastructure/redis';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    if (session.role !== 'administracion' && session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'Permiso denegado' } }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: { message: 'El nombre es requerido.' } }, { status: 400 });
    }

    if (status !== 'active' && status !== 'inactive') {
      return NextResponse.json({ success: false, error: { message: 'Estado inválido.' } }, { status: 400 });
    }

    const [updated] = await db
      .update(expenseTypes)
      .set({
        name: name.trim(),
        status,
        updatedAt: new Date()
      })
      .where(and(
        eq(expenseTypes.id, id),
        eq(expenseTypes.companyId, session.companyId)
      ))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: { message: 'Tipo de gasto no encontrado.' } }, { status: 404 });
    }

    // Invalidate Cache
    const cacheKey = `expense_types:${session.companyId}`;
    await delCache(cacheKey);

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('Error updating expense type:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    if (session.role !== 'administracion' && session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'Permiso denegado' } }, { status: 403 });
    }

    const { id } = await params;

    // Check if type exists
    const [existing] = await db
      .select()
      .from(expenseTypes)
      .where(and(
        eq(expenseTypes.id, id),
        eq(expenseTypes.companyId, session.companyId)
      ))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ success: false, error: { message: 'Tipo de gasto no encontrado.' } }, { status: 404 });
    }

    // Standard codes (01 to 10) cannot be hard deleted, only deactivated
    const standardCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
    if (standardCodes.includes(existing.code)) {
      // Soft-delete: update status to inactive
      await db
        .update(expenseTypes)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(expenseTypes.id, id));
    } else {
      // Hard delete custom codes
      await db
        .delete(expenseTypes)
        .where(eq(expenseTypes.id, id));
    }

    // Invalidate Cache
    const cacheKey = `expense_types:${session.companyId}`;
    await delCache(cacheKey);

    return NextResponse.json({ success: true, message: 'Tipo de gasto eliminado/desactivado con éxito.' });
  } catch (err: any) {
    console.error('Error deleting expense type:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
