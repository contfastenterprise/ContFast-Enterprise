import { NextRequest, NextResponse } from 'next/server';
import { createShareTokenAction } from '@/actions/documents';
import { verifyAuth } from '@/middleware/auth';

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

    const { type, id } = await params;

    const result = await createShareTokenAction(type, id, auth.companyId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
