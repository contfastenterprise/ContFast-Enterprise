import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { inventoryLevels, warehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { getProvisionalStock } from '@/services/inventoryService';

export async function GET(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const resHeaders = new Headers();
    const auth = await verifyAuth(req, resHeaders);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

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

    const detailedLevels = await Promise.all(
      levels.map(async (level) => {
        const provStock = await getProvisionalStock(productId, level.warehouseId);
        return {
          ...level,
          availableQuantity: provStock.toString(),
        };
      })
    );

    return NextResponse.json({ success: true, data: detailedLevels }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching inventory levels:', error);
    const status = error.status || 500;
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch inventory levels' }, { status });
  }
}
