import { NextRequest, NextResponse } from 'next/server';
import { db, inventoryMovements, products, warehouses, users } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { eq, and, desc, asc, sql, ilike, or, gte, lte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const warehouseId = searchParams.get('warehouseId');
    const productId = searchParams.get('productId');
    const type = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    let filters = [eq(inventoryMovements.companyId, session.companyId)];

    if (warehouseId && warehouseId !== 'all') {
      filters.push(eq(inventoryMovements.warehouseId, warehouseId));
    }
    if (productId && productId !== 'all') {
      filters.push(eq(inventoryMovements.productId, productId));
    }
    if (type && type !== 'all') {
      filters.push(eq(inventoryMovements.type, type));
    }
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filters.push(gte(inventoryMovements.createdAt, start));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filters.push(lte(inventoryMovements.createdAt, end));
    }

    const offset = (page - 1) * limit;

    // Fetch movements
    const data = await db.select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      balanceAfter: inventoryMovements.balanceAfter,
      referenceId: inventoryMovements.referenceId,
      description: inventoryMovements.description,
      createdAt: inventoryMovements.createdAt,
      productName: products.name,
      productSku: products.sku,
      warehouseName: warehouses.name,
      userName: users.name
    })
    .from(inventoryMovements)
    .leftJoin(products, eq(inventoryMovements.productId, products.id))
    .leftJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
    .leftJoin(users, eq(inventoryMovements.userId, users.id))
    .where(and(...filters))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit)
    .offset(offset);

    // Fetch total count for pagination
    const totalQuery = await db.select({ count: sql<number>`count(*)` })
      .from(inventoryMovements)
      .where(and(...filters));
    const total = totalQuery[0]?.count || 0;

    // Fetch summary metrics (total in/out) without pagination, but respecting filters
    const allFiltered = await db.select({
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity
    })
    .from(inventoryMovements)
    .where(and(...filters));

    let totalIn = 0;
    let totalOut = 0;

    for (const mov of allFiltered) {
      const qty = parseFloat(mov.quantity as any) || 0;
      if (qty > 0) {
        totalIn += qty;
      } else {
        totalOut += Math.abs(qty);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        items: data,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        summary: {
          totalIn,
          totalOut,
          netChange: totalIn - totalOut
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching inventory movements:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
