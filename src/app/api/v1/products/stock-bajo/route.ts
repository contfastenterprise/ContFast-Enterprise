import { NextRequest, NextResponse } from 'next/server';
import { db, products, inventoryLevels } from '@/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { contarProductosConStockBajo } from '@/services/inventario/existencia';

/**
 * LOTE 285: cuantos productos estan por debajo de su minimo, para la tarjeta "Stock Bajo" de
 * Productos, que pintaba un `0` escrito a mano.
 *
 * Por que una ruta propia y no un dato mas del listado: el listado se pide en cada tecla del
 * buscador y por paginas de 15; la tarjeta habla del catalogo entero y no cambia al buscar. Contarlo
 * en el listado seria una consulta mas por tecla.
 *
 * Acotada por empresa y modo, como el listado y la reorden (el indice unico de `inventory_levels`
 * es producto + almacen + modo: sin el modo, PRUEBA contaria los niveles de PRODUCCION). Solo trae
 * los niveles con minimo puesto -- los unicos que pueden estar "bajos" -- y la regla la decide
 * `contarProductosConStockBajo`, la misma de reorden, en un solo sitio.
 */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'read');

    const niveles = await db
      .select({
        productId: inventoryLevels.productId,
        quantity: inventoryLevels.quantity,
        minStock: inventoryLevels.minStock,
        tracksInventory: products.tracksInventory,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .where(
        and(
          eq(inventoryLevels.companyId, auth.companyId),
          eq(inventoryLevels.modo, auth.modo),
          eq(products.companyId, auth.companyId),
          isNull(products.deletedAt),
          eq(products.tracksInventory, true),
          sql`CAST(${inventoryLevels.minStock} AS numeric) > 0`
        )
      );

    return NextResponse.json(
      { success: true, data: { total: contarProductosConStockBajo(niveles) } },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in GET /api/v1/products/stock-bajo:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
