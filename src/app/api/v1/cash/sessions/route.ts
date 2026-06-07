import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashService } from '@/services/cashService';

const openSessionSchema = z.object({
  cashRegisterId: z.string().uuid('ID de caja registradora inválido'),
  initialBalance: z.number().nonnegative('El fondo inicial de caja no puede ser negativo'),
});

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "caja:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'write');

    const body = await req.json();
    const result = openSessionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const session = await CashService.openSession(
      auth.userId,
      auth.companyId,
      result.data.cashRegisterId,
      result.data.initialBalance
    );

    return NextResponse.json(
      { success: true, data: session },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/cash/sessions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
