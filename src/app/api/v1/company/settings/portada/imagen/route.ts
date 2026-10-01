import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { Logger } from '@/utils/logger';
import { subirFotoDeLaEmpresa } from '@/services/productos/subirFoto';

/**
 * Lote 235: subir la IMAGEN de la portada de la tienda. Devuelve su direccion;
 * se guarda con la portada al pulsar Guardar (`PUT ../portada`).
 *
 * Mismo permiso que el resto de Configuracion (`administracion:write`) y la
 * misma subida que la foto de un producto (`subirFotoDeLaEmpresa`): los bytes
 * mandan, tope de 1 MB y nombre puesto por el servidor bajo la empresa.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!(await checkRateLimit(ip, 'standard'))) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 },
      );
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });
    }
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'administracion', 'write');

    const subida = await subirFotoDeLaEmpresa(auth.companyId, (await req.formData()).get('file'));
    if (!subida.bien) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: subida.mensaje } }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: { imageUrl: subida.imageUrl } }, { status: 201 });
  } catch (error: unknown) {
    const e = error as Error & { status?: number; code?: string };
    if (e.status === 403) {
      return NextResponse.json({ success: false, error: { code: e.code || 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    Logger.error('[portada/imagen] no se pudo subir la imagen', { motivo: e.message });
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo subir la imagen.' } }, { status: 500 });
  }
}
