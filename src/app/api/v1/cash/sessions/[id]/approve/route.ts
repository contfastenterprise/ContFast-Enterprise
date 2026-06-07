import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashService } from '@/services/cashService';

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

    // Enforce "administracion:write" or equivalent supervisor permissions
    if (auth.role !== 'administracion' && auth.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acción restringida. Requiere rol de Administración o Sistemas.' } },
        { status: 403, headers: resHeaders }
      );
    }

    const session = await CashService.approveSession(auth.userId, auth.companyId, id);

    return NextResponse.json(
      { success: true, message: 'Sesión de caja aprobada con éxito por el supervisor.', data: session },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/cash/sessions/[id]/approve:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
