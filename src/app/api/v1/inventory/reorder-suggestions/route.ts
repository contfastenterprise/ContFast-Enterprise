import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { inventoryLevels, products, warehouses } from '@/db/schema';
import { eq, and, sql, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';

export async function GET(req: NextRequest) {
  try {
    const resHeaders = new Headers();
    const auth = await verifyAuth(req, resHeaders);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const criticalLevels = await db
      .select({
        id: inventoryLevels.id,
        productId: products.id,
        productName: products.name,
        sku: products.sku,
        unitOfMeasure: products.unitOfMeasure,
        cost: products.cost,
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        quantity: inventoryLevels.quantity,
        minStock: inventoryLevels.minStock,
        maxStock: inventoryLevels.maxStock,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
      .where(
        and(
          eq(inventoryLevels.companyId, auth.companyId),
          eq(inventoryLevels.modo, auth.modo),
          gt(sql`CAST(${inventoryLevels.minStock} AS numeric)`, 0),
          sql`CAST(${inventoryLevels.quantity} AS numeric) <= CAST(${inventoryLevels.minStock} AS numeric)`
        )
      );

    const suggestions = criticalLevels.map((lvl) => {
      const quantity = Number(lvl.quantity) || 0;
      const minStock = Number(lvl.minStock) || 0;
      const maxStock = lvl.maxStock ? Number(lvl.maxStock) : 0;

      let reorderQuantity = 0;
      if (maxStock > 0) {
        reorderQuantity = Math.max(0, maxStock - quantity);
      } else {
        reorderQuantity = Math.max(0, (minStock * 2) - quantity);
      }

      return {
        ...lvl,
        reorderQuantity: Math.ceil(reorderQuantity)
      };
    });

    return NextResponse.json({ success: true, data: suggestions }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching reorder suggestions:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch suggestions' }, { status: 500 });
  }
}
