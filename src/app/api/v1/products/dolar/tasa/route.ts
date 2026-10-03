import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { esAdminOSistemas } from '@/utils/rolMatch';
import { diaRD } from '@/utils/fechasLocales';
import { clearCachePattern } from '@/infrastructure/redis';
import { leerTasa } from '@/services/precios/preciosEnDolares';
import { PreciosEnDolaresRepositorio } from '@/services/precios/preciosEnDolaresRepositorio';
import { fallo, noAutenticado, rechazo, soloAdministracion } from '@/services/precios/respuestasDeDolares';

/**
 * PUT /api/v1/products/dolar/tasa -- la tasa de HOY (lote 247).
 *
 * La tasa es propia de la empresa y se escribe a mano (decision del dueno). El
 * dia lo pone el servidor, y es el de RD: en UTC, a partir de las 20:00 de RD ya
 * seria "manana". Escribirla NO cambia ningun precio: eso se confirma aparte.
 *
 * LOTE 261: con `aplicar: true` en el cuerpo, escribe la tasa Y aplica los precios
 * a todos los productos atados, en una transaccion. Es el cambio de tasa de Compras
 * y Facturacion (decision del dueño: alli se aplica sin otra confirmacion). Sin
 * `aplicar`, lo de siempre: Productos sigue con sus dos pasos. Solo `true` aplica:
 * un `"true"` o un `1` no, para que un cuerpo mal armado no cambie precios.
 */
export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const cuerpo = (await req.json().catch(() => null)) as { tasa?: unknown; aplicar?: unknown } | null;
    const tasa = leerTasa(cuerpo?.tasa);
    if (!tasa.bien) return rechazo(400, 'VALIDATION_ERROR', tasa.mensaje);

    if (cuerpo?.aplicar === true) {
      const hecho = await PreciosEnDolaresRepositorio.guardarTasaYAplicar(auth.companyId, diaRD(), tasa.valor, auth.userId);
      //  El listado de productos se guarda en cache con sus precios (como en `aplicar`).
      await clearCachePattern(`cache:products:${auth.companyId}:*`);
      return NextResponse.json({ success: true, data: hecho });
    }

    const guardada = await PreciosEnDolaresRepositorio.guardarTasa(auth.companyId, diaRD(), tasa.valor, auth.userId);
    return NextResponse.json({ success: true, data: { tasa: guardada } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo guardar la tasa');
  }
}
