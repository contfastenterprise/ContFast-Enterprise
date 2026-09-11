import { NextRequest, NextResponse } from 'next/server';
import { createShareTokenAction } from '@/actions/documents';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    // Auditoria F0-03: estas rutas no verificaban sesion ni empresa, y quedaban fuera
    // del matcher del proxy. Cualquiera con el UUID de una factura podia descargar su
    // PDF, reenviarla por correo a un destinatario arbitrario o generar un enlace
    // publico de 30 dias, sin autenticarse y sin importar de que empresa fuera.
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // ISO-03: aquello cerro la SESION, no el PERMISO, y esta ruta se quedo en la
    // lista PENDIENTES de permisosRutas.vitest.ts. Mientras tanto, cualquier
    // sesion de la empresa -- el cajero, el de recursos humanos -- podia acuñar un enlace publico de 30 dias a cualquier comprobante fiscal.
    //
    // `requirePermission` y no `enforcePermission`: el catch de abajo cierra con
    // 500 fijo, asi que un `enforcePermission` que lanza habria presentado una
    // denegacion de permisos como averia del servidor.
    const denegado = await requirePermission(auth, 'facturacion', 'write');
    if (denegado) return denegado;

    const { type, id } = await params;

    const result = await createShareTokenAction(type, id, auth.companyId, auth.modo);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
