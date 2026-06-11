import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { inventoryLevels, warehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: productId } = await params;

    const levels = await db.select({
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
      quantity: inventoryLevels.quantity,
    })
    .from(inventoryLevels)
    .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
    .where(
      and(
        eq(inventoryLevels.companyId, auth.companyId),
        eq(inventoryLevels.productId, productId)
      )
    );

    return NextResponse.json({ success: true, data: levels });
  } catch (error) {
    console.error('Error fetching inventory levels:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch inventory levels' }, { status: 500 });
  }
}
