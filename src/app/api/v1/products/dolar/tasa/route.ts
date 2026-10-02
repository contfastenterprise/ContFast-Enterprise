import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { esAdminOSistemas } from '@/utils/rolMatch';
import { diaRD } from '@/utils/fechasLocales';
import { leerTasa } from '@/services/precios/preciosEnDolares';
import { PreciosEnDolaresRepositorio } from '@/services/precios/preciosEnDolaresRepositorio';
import { fallo, noAutenticado, rechazo, soloAdministracion } from '@/services/precios/respuestasDeDolares';

/**
 * PUT /api/v1/products/dolar/tasa -- la tasa de HOY (lote 247).
 *
 * La tasa es propia de la empresa y se escribe a mano (decision del dueno). El
 * dia lo pone el servidor, y es el de RD: en UTC, a partir de las 20:00 de RD ya
 * seria "manana". Escribirla NO cambia ningun precio: eso se confirma aparte.
 */
export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');
    if (!esAdminOSistemas(auth.role)) return soloAdministracion();

    const cuerpo = (await req.json().catch(() => null)) as { tasa?: unknown } | null;
    const tasa = leerTasa(cuerpo?.tasa);
    if (!tasa.bien) return rechazo(400, 'VALIDATION_ERROR', tasa.mensaje);

    const guardada = await PreciosEnDolaresRepositorio.guardarTasa(auth.companyId, diaRD(), tasa.valor, auth.userId);
    return NextResponse.json({ success: true, data: { tasa: guardada } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo guardar la tasa');
  }
}
