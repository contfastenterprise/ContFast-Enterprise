import { NextRequest, NextResponse } from 'next/server';
import { sendDocumentEmailAction } from '@/actions/documents';
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
    const body = await req.json();
    const { toEmail } = body;

    if (!toEmail) {
      return NextResponse.json({ error: 'Email destino es requerido' }, { status: 400 });
    }

    const result = await sendDocumentEmailAction(type, id, toEmail, auth.companyId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
