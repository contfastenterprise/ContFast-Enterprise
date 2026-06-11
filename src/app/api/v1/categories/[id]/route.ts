import { NextRequest, NextResponse } from 'next/server';
import { db, productCategories } from '@/db';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, description, status } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: { message: 'El nombre es requerido' } }, { status: 400 });
    }

    const updated = await db.update(productCategories)
      .set({ name, description, status, updatedAt: new Date() })
      .where(and(eq(productCategories.id, id), eq(productCategories.companyId, auth.companyId)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Categoría no encontrada' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated[0] });
  } catch (error: any) {
    console.error('Error updating category:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });

    const { id } = await params;

    // En lugar de borrar físicamente, actualizamos deletedAt para soft delete o comprobamos su uso.
    // Usaremos borrado físico si no hay dependencias, o status = inactive si se quiere soft-delete
    
    // Todo: Check if products use this category before deleting. 
    // Here we'll do a simple delete
    const deleted = await db.delete(productCategories)
      .where(and(eq(productCategories.id, id), eq(productCategories.companyId, auth.companyId)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'Categoría no encontrada' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    if (error.code === '23503') { // Foreign key violation
      return NextResponse.json({ success: false, error: { message: 'No se puede eliminar la categoría porque hay productos asignados a ella.' } }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
