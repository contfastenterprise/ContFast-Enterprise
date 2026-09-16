import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { AccountRepository } from '@/repositories/accountRepository';

/**
 * Abre los periodos contables que faltan desde este mes y los doce siguientes,
 * en la empresa y el modo de la sesion.
 *
 * Lote 145: nadie abria periodos despues del alta de la empresa, y las seis
 * terminaban el 31/12/2026. El calculo y el porque viven en
 * `services/accounting/coberturaPeriodos.ts` y en
 * `AccountRepository.abrirPeriodosSiguientes`.
 */
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const session = await verifyAuth(req, resHeaders);
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
  }

  try {
    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'contabilidad', 'write');

    const creados = await AccountRepository.abrirPeriodosSiguientes(session.companyId, session.modo, session.userId);

    return NextResponse.json(
      {
        success: true,
        message: creados.length === 0
          ? 'Los próximos 12 meses ya tenían período.'
          : `Se abrieron ${creados.length} período(s): ${creados.map((p) => p.name).join(', ')}.`,
        data: creados,
      },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error opening next periods:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
