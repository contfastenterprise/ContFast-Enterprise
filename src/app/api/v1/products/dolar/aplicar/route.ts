import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { esAdminOSistemas } from '@/utils/rolMatch';
import { clearCachePattern } from '@/infrastructure/redis';
import { PreciosEnDolaresRepositorio } from '@/services/precios/preciosEnDolaresRepositorio';
import { esUuid, fallo, noAutenticado, rechazo, soloAdministracion } from '@/services/precios/respuestasDeDolares';

/** Lo que cabe en una confirmacion: muy por encima de cualquier catalogo de hoy. */
const MAXIMO = 2000;

/**
 * POST /api/v1/products/dolar/aplicar -- aplica los precios de la tasa vigente
 * a los productos elegidos (lote 247). Es la CONFIRMACION del dueno: nada cambia
 * de precio sin pasar por aqui.
 *
 * El cuerpo lleva la tasa que se vio en pantalla y los productos marcados. Los
 * importes NO viajan: los calcula el servidor con la misma regla que enseno la
 * pantalla, y si la tasa ya no es la que se vio, se rechaza.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const cuerpo = (await req.json().catch(() => null)) as { tasa?: unknown; productos?: unknown } | null;
    const productos = cuerpo?.productos;
    if (!Array.isArray(productos) || productos.length === 0 || productos.length > MAXIMO || !productos.every(esUuid)) {
      return rechazo(400, 'VALIDATION_ERROR', 'Marca al menos un producto para aplicarle el precio.');
    }

    const hecho = await PreciosEnDolaresRepositorio.aplicar(auth.companyId, auth.userId, cuerpo?.tasa, [...new Set(productos)]);
    //  El listado de productos se guarda en cache con sus precios.
    await clearCachePattern(`cache:products:${auth.companyId}:*`);
    return NextResponse.json({ success: true, data: hecho });
  } catch (error: unknown) {
    return fallo(error, 'no se pudieron aplicar los precios');
  }
}
