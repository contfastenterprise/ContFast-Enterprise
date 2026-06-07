import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashService } from '@/services/cashService';

const closeSessionSchema = z.object({
  actualBalance: z.number().nonnegative('El saldo real contado de caja no puede ser negativo'),
  justification: z.string().optional(),
});

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

    // Enforce "caja:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'write');

    const body = await req.json();
    const result = closeSessionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const closeResult = await CashService.closeSession(
      auth.userId,
      auth.companyId,
      id,
      result.data.actualBalance,
      result.data.justification
    );

    return NextResponse.json(
      { success: true, data: closeResult },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/cash/sessions/[id]/close:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
