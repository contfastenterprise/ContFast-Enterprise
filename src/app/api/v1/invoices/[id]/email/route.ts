import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { Logger } from '@/utils/logger';
import { enviarFacturaPorCorreo } from '@/services/invoice/correoFactura';

export const runtime = 'nodejs';

/** Cada motivo de no-envio con el codigo HTTP que le corresponde. */
const ESTADO_POR_MOTIVO: Record<string, number> = {
  factura_no_encontrada: 404,
  sin_empresa: 404,
  sin_cliente: 400,
  cliente_no_existe: 400,
  sin_correo: 400,
  no_aceptada: 409,
  ya_enviado: 409,
};

const CODIGO_POR_MOTIVO: Record<string, string> = {
  factura_no_encontrada: 'NOT_FOUND',
  sin_empresa: 'NOT_FOUND',
  sin_cliente: 'BAD_REQUEST',
  cliente_no_existe: 'BAD_REQUEST',
  sin_correo: 'NO_EMAIL',
  no_aceptada: 'NOT_ACCEPTED',
  ya_enviado: 'ALREADY_SENT',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    // El armado del PDF y el encolado del correo viven en
    // services/invoice/correoFactura.ts: los comparte con la sincronizacion, que
    // manda el correo cuando la DGII acepta. Aqui `esReenvio` es true -- lo pide
    // una persona -- asi que no exige que este aceptada y no toca la marca de
    // envio automatico.
    const resultado = await enviarFacturaPorCorreo({
      invoiceId: id,
      companyId: auth.companyId,
      modo: auth.modo,
      esReenvio: true,
    });

    if (!resultado.enviado) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: CODIGO_POR_MOTIVO[resultado.motivo] ?? 'BAD_REQUEST',
            message: resultado.mensaje,
          },
        },
        { status: ESTADO_POR_MOTIVO[resultado.motivo] ?? 400, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, message: `Correo reenviado exitosamente a ${resultado.correo}.` },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    Logger.error('Error in POST /api/v1/invoices/[id]/email', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
