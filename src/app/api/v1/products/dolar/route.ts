import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { esAdminOSistemas } from '@/utils/rolMatch';
import { diaRD } from '@/utils/fechasLocales';
import { leerCostoUsd, leerPrecioUsd } from '@/services/precios/preciosEnDolares';
import { PreciosEnDolaresRepositorio } from '@/services/precios/preciosEnDolaresRepositorio';
import { esUuid, fallo, noAutenticado, rechazo, soloAdministracion } from '@/services/precios/respuestasDeDolares';

/**
 * Lote 247: los productos cuyo precio sigue al dolar.
 *
 *   GET            la tasa vigente, las ultimas escritas y cada producto atado
 *                  con lo que cambiaria si se aplicara hoy (no cambia nada);
 *   GET ?buscar=   productos que aun no estan atados, para elegir uno;
 *   PUT            ata uno o varios productos con el mismo costo en dolares
 *                  (`productIds`, lote 251; `productId` sigue valiendo), o se lo cambia;
 *   PATCH          fija o quita el precio BASE en dolares de un producto atado (lote 258);
 *   DELETE         lo suelta (sus precios se quedan como estan).
 *
 * Ver lo pide el permiso de ver el catalogo. Todo lo que ESCRIBE (atar, soltar
 * y, en sus rutas, la tasa y aplicar los precios) es de administracion: el costo
 * en dolares y la tasa los fija el dueno.
 */
/** Cuantos productos se atan de una vez (lote 251): una busqueda trae 20; esto es holgura, no un limite de uso. */
const MAXIMO_A_LA_VEZ = 200;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'read');

    const buscar = new URL(req.url).searchParams.get('buscar');
    if (buscar !== null) {
      const productos = await PreciosEnDolaresRepositorio.buscarParaAtar(auth.companyId, buscar);
      return NextResponse.json({ success: true, data: { productos } });
    }

    const [{ tasa, renglones }, { historial }] = await Promise.all([
      PreciosEnDolaresRepositorio.listar(auth.companyId),
      PreciosEnDolaresRepositorio.tasas(auth.companyId),
    ]);
    return NextResponse.json({
      success: true,
      data: { tasa, historial, renglones, hoy: diaRD(), puedeAplicar: esAdminOSistemas(auth.role) },
    });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo leer');
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const cuerpo = (await req.json().catch(() => null)) as { productId?: unknown; productIds?: unknown; costoUsd?: unknown } | null;
    const ids = Array.isArray(cuerpo?.productIds) ? cuerpo.productIds : [cuerpo?.productId];
    if (ids.length === 0 || ids.length > MAXIMO_A_LA_VEZ || !ids.every(esUuid)) {
      return rechazo(400, 'VALIDATION_ERROR', ids.length > MAXIMO_A_LA_VEZ ? `Se pueden añadir hasta ${MAXIMO_A_LA_VEZ} productos a la vez.` : 'Falta el producto.');
    }
    const costo = leerCostoUsd(cuerpo?.costoUsd);
    if (!costo.bien) return rechazo(400, 'VALIDATION_ERROR', costo.mensaje);

    const atado = await PreciosEnDolaresRepositorio.atar(auth.companyId, ids, costo.valor);
    if (!atado) return rechazo(404, 'NOT_FOUND', ids.length > 1 ? 'Alguno de esos productos no existe en esta empresa. No se añadió ninguno.' : 'Ese producto no existe en esta empresa.');
    return NextResponse.json({ success: true, data: { productIds: ids, costoUsd: costo.valor } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo atar el producto');
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const cuerpo = (await req.json().catch(() => null)) as { productId?: unknown; precioUsd?: unknown } | null;
    if (!cuerpo || !esUuid(cuerpo.productId)) return rechazo(400, 'VALIDATION_ERROR', 'Falta el producto.');
    const precio = leerPrecioUsd(cuerpo.precioUsd);
    if (!precio.bien) return rechazo(400, 'VALIDATION_ERROR', precio.mensaje);

    const fijado = await PreciosEnDolaresRepositorio.fijarPrecioUsd(auth.companyId, cuerpo.productId, precio.valor);
    if (!fijado) return rechazo(404, 'NOT_FOUND', 'Ese producto no sigue al dólar en esta empresa.');
    return NextResponse.json({ success: true, data: { productId: cuerpo.productId, precioUsd: precio.valor } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo guardar el precio en dolares');
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const productId = new URL(req.url).searchParams.get('productId');
    if (!esUuid(productId)) return rechazo(400, 'VALIDATION_ERROR', 'Falta el producto.');
    const suelto = await PreciosEnDolaresRepositorio.desatar(auth.companyId, productId);
    if (!suelto) return rechazo(404, 'NOT_FOUND', 'Ese producto no estaba atado al dólar.');
    return NextResponse.json({ success: true, data: { productId } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo soltar el producto');
  }
}
