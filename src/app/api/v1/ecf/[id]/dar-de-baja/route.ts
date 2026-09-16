import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { darDeBajaRechazado, BajaNoPermitidaError } from '@/services/invoice/bajaDeRechazado';

/**
 * Dar de baja un comprobante que la DGII rechazo despues de contabilizado.
 *
 * Toda la regla -- cuando se puede, que deshace y por que no se hace solo al
 * llegar el rechazo -- esta en `services/invoice/bajaDeRechazado.ts`. Esta ruta
 * solo autentica, exige permiso de escritura en facturacion (el mismo que
 * "Reenviar", la otra salida de un rechazado) y traduce la negativa a un 409.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const resultado = await darDeBajaRechazado({
      invoiceId: id,
      companyId: auth.companyId,
      modo: auth.modo,
      userId: auth.userId,
    });

    return NextResponse.json(
      { success: true, message: `Comprobante ${resultado.ncf} dado de baja.`, data: resultado },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    if (error instanceof BajaNoPermitidaError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status, headers: resHeaders }
      );
    }
    console.error('Error in POST /api/v1/ecf/[id]/dar-de-baja:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
