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
      minStock: inventoryLevels.minStock,
      maxStock: inventoryLevels.maxStock,
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

export async function POST(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const resHeaders = new Headers();
    const auth = await verifyAuth(req, resHeaders);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const { id: productId } = await params;
    const body = await req.json();
    const { warehouseId, minStock, maxStock } = body;

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: 'Warehouse ID is required' }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(inventoryLevels)
      .where(
        and(
          eq(inventoryLevels.companyId, auth.companyId),
          eq(inventoryLevels.productId, productId),
          eq(inventoryLevels.warehouseId, warehouseId),
          eq(inventoryLevels.modo, auth.modo)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(inventoryLevels)
        .set({
          minStock: minStock !== undefined ? minStock.toString() : existing.minStock,
          maxStock: maxStock !== undefined ? (maxStock === null ? null : maxStock.toString()) : existing.maxStock,
          updatedAt: new Date()
        })
        .where(eq(inventoryLevels.id, existing.id));
    } else {
      await db
        .insert(inventoryLevels)
        .values({
          companyId: auth.companyId,
          productId,
          warehouseId,
          modo: auth.modo,
          quantity: '0.0000',
          minStock: minStock !== undefined ? minStock.toString() : '0.0000',
          maxStock: maxStock !== undefined ? (maxStock === null ? null : maxStock.toString()) : null
        });
    }

    return NextResponse.json({ success: true, message: 'Stock limits updated successfully' }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error updating stock limits:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update stock limits' }, { status: 500 });
  }
}
