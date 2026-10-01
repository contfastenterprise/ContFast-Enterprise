import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { StorageService } from '@/services/storageService';
import { Logger } from '@/utils/logger';
import {
  DEPOSITO_DE_FOTOS, direccionDeFoto, motivoParaNoAceptarFoto, PESO_MAXIMO_DE_FOTO, rutaDeFoto, tipoDeFoto,
} from '@/services/productos/fotoDeProducto';

/**
 * Lote 234: subir la FOTO de un producto. Devuelve su direccion publica; el
 * formulario la guarda con el producto (`imageUrl`), igual al crear que al
 * editar -- por eso esta ruta no toca ningun producto: al crear aun no existe.
 *
 * Mismo permiso que crear o editar un producto (`catalogo:write`). Lo que es
 * una imagen lo deciden sus bytes (`tipoDeFoto`), y el nombre con que se guarda
 * lo pone el servidor bajo la empresa de la sesion.
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No se recibió ninguna imagen.' } }, { status: 400 });
    }
    //  Antes de leerlo entero: un fichero enorme no se carga en memoria.
    if (file.size > PESO_MAXIMO_DE_FOTO) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'La imagen pesa más de 1 MB. Súbela desde el formulario, que la reduce sola.' } }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const motivo = motivoParaNoAceptarFoto(bytes);
    const tipo = tipoDeFoto(bytes);
    if (motivo || !tipo) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: motivo ?? 'El archivo no es una imagen válida.' } }, { status: 400 });
    }

    const ruta = rutaDeFoto(auth.companyId, randomUUID(), tipo.ext);
    await StorageService.uploadPublicFile(DEPOSITO_DE_FOTOS, ruta, bytes, tipo.mime);

    return NextResponse.json({ success: true, data: { imageUrl: direccionDeFoto(process.env.SUPABASE_URL || '', ruta) } }, { status: 201 });
  } catch (error: unknown) {
    const e = error as Error & { status?: number; code?: string };
    if (e.status === 403) {
      return NextResponse.json({ success: false, error: { code: e.code || 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    Logger.error('[products/image] no se pudo subir la foto', { motivo: e.message });
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo subir la imagen.' } }, { status: 500 });
  }
}
