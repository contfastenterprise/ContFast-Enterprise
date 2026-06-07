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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'read');

    const activeSession = await CashRepository.getActiveSession(auth.userId, auth.companyId);

    return NextResponse.json(
      { success: true, data: activeSession },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/cash/sessions/active:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
