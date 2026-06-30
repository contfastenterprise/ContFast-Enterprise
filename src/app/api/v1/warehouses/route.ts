import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { warehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = auth.companyId;
    
    // Todo: Filtrar por los almacenes a los que tiene acceso si no es admin
    // Por ahora obtenemos todos los de la compañía
    const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));

    return NextResponse.json({ success: true, data: companyWarehouses });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json({ error: 'Failed to fetch warehouses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = auth.companyId;
    
    // Only admins/system can create warehouses
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await req.json();
    const { name, code, address, status } = data;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
    }

    // Comprobar que el código no exista
    const existing = await db.select().from(warehouses).where(
      and(eq(warehouses.companyId, companyId), eq(warehouses.code, code))
    );

    if (existing.length > 0) {
      return NextResponse.json({ error: 'A warehouse with this code already exists' }, { status: 400 });
    }

    const newWarehouse = await db.insert(warehouses).values({
      id: uuidv4(),
      companyId,
      name,
      code,
      address,
      status: status || 'active',
    }).returning();

    return NextResponse.json({ data: newWarehouse[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating warehouse:', error);
    return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
  }
}
