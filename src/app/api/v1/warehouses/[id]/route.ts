import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { warehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const warehouse = await db.select().from(warehouses).where(
      and(eq(warehouses.companyId, auth.companyId), eq(warehouses.id, id))
    );

    if (warehouse.length === 0) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    return NextResponse.json({ data: warehouse[0] });
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    return NextResponse.json({ error: 'Failed to fetch warehouse' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admins/system can update warehouses
    if (auth.role !== 'administrador' && auth.role !== 'sistemas') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const data = await req.json();

    const existing = await db.select().from(warehouses).where(
      and(eq(warehouses.companyId, auth.companyId), eq(warehouses.id, id))
    );

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    const updated = await db.update(warehouses).set({
      name: data.name,
      code: data.code,
      address: data.address,
      status: data.status,
      updatedAt: new Date()
    }).where(and(eq(warehouses.companyId, auth.companyId), eq(warehouses.id, id))).returning();

    return NextResponse.json({ data: updated[0] });
  } catch (error) {
    console.error('Error updating warehouse:', error);
    return NextResponse.json({ error: 'Failed to update warehouse' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admins/system can delete warehouses
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({ error: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }, { status: 403 });
    }

    const { id } = await params;
    
    // We do a soft delete to avoid breaking historical records
    const updated = await db.update(warehouses).set({
      status: 'inactive',
      deletedAt: new Date()
    }).where(and(eq(warehouses.companyId, auth.companyId), eq(warehouses.id, id))).returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    return NextResponse.json({ error: 'Failed to delete warehouse' }, { status: 500 });
  }
}
