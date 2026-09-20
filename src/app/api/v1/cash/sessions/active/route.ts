import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashRepository } from '@/repositories/cashRepository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "caja:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'caja', 'read');

    const activeSession = await CashRepository.getActiveSession(auth.userId, auth.companyId, auth.modo);

    // ARQUEO CIEGO (lote 172, decision del dueño 2026-09-20).
    //
    // El saldo esperado NO sale por aqui mientras la sesion esta abierta. Si
    // sale, el conteo es copiable -- y se copio: las tres sesiones cerradas de
    // Latin Doors cuadran al centavo, con los centimos del esperado escritos en
    // el campo de monedas, y 85.000,00 reales en la caja.
    //
    // Va en el SERVIDOR y no en la pantalla a proposito: ocultarlo solo en la
    // vista lo deja igual de disponible en la respuesta de red. Al cerrar, la
    // respuesta del cierre si trae esperado, contado y diferencia; y el resumen
    // de una sesion ya cerrada los trae enteros.
    const sinEsperado = activeSession
      ? { ...activeSession, expectedBalance: undefined }
      : null;

    return NextResponse.json(
      { success: true, data: sinEsperado },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in GET /api/v1/cash/sessions/active:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
