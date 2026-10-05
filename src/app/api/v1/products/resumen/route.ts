import { NextRequest, NextResponse } from 'next/server';
import { db, products, inventoryLevels } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { contarProductosConStockBajo } from '@/services/inventario/existencia';
import { valorDelInventario } from '@/services/inventario/valorDeInventario';

/**
 * El resumen del CATALOGO ENTERO para las tarjetas de Productos: cuantos productos estan en su minimo
 * o por debajo ("Stock Bajo", lote 285) y cuanto vale el inventario ("Valor de Inventario", lote 291).
 *
 * LOTE 291: era `GET /api/v1/products/stock-bajo` (lote 285, sin fusionar todavia). La tarjeta del
 * valor sumaba `cost` de la pagina visible y sin multiplicar por la existencia; necesita lo mismo que
 * el conteo -- los niveles del catalogo entero -- asi que la ruta se amplia en vez de nacer otra, y la
 * pantalla hace UNA peticion para las dos tarjetas.
 *
 * Por que una ruta propia y no un dato mas del listado: el listado se pide en cada tecla del buscador
 * y por paginas de 15; las tarjetas hablan del catalogo entero y no cambian al buscar.
 *
 * Acotada por empresa y modo (el indice unico de `inventory_levels` es producto + almacen + modo: sin
 * el modo, PRUEBA contaria los niveles de PRODUCCION), sin borrados ni productos sin inventario. Trae
 * TODOS los niveles: el conteo de stock bajo solo mira los que tienen minimo (lo decide
 * `estaBajoElMinimo`, igual que antes cuando el filtro iba en la consulta), y el valor necesita todos.
 * Las dos reglas viven en `services/inventario/`, puras, y aqui solo se llaman.
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
        averageCost: inventoryLevels.averageCost,
        tracksInventory: products.tracksInventory,
        deletedAt: products.deletedAt,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .where(
        and(
          eq(inventoryLevels.companyId, auth.companyId),
          eq(inventoryLevels.modo, auth.modo),
          eq(products.companyId, auth.companyId),
          isNull(products.deletedAt),
          eq(products.tracksInventory, true)
        )
      );

    const valor = valorDelInventario(niveles);
    return NextResponse.json(
      {
        success: true,
        data: {
          stockBajo: contarProductosConStockBajo(niveles),
          valorInventario: valor.valor,
          nivelesSinCosto: valor.sinCosto,
          nivelesNegativos: valor.negativos,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in GET /api/v1/products/resumen:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
