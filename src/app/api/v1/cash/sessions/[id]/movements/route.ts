import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashService } from '@/services/cashService';
import { CashRepository } from '@/repositories/cashRepository';
import { db, cashSessions } from '@/db';
import { eq, and } from 'drizzle-orm';

const createMovementSchema = z.object({
  type: z.enum(['refund', 'cash_in', 'cash_out']),
  amount: z.number().positive('El monto debe ser un valor positivo'),
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
  reference: z.string().optional(),
});

/**
 * GET /api/v1/cash/sessions/[id]/movements - List movements in a session
 */
export async function GET(
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

    // Enforce "caja:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'read');

    // Cajero validation: Can only see their own active or closed session
    const [session] = await db
      .select({ userId: cashSessions.userId })
      .from(cashSessions)
      .where(and(eq(cashSessions.id, id), eq(cashSessions.companyId, auth.companyId)))
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Sesión de caja no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (auth.role.toLowerCase().includes('cajero') && session.userId !== auth.userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Como cajero, solo puede visualizar los movimientos de su propia sesión.' } },
        { status: 403, headers: resHeaders }
      );
    }

    const movements = await CashRepository.getMovements(id, auth.companyId);

    return NextResponse.json(
      { success: true, data: movements },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/cash/sessions/[id]/movements:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/cash/sessions/[id]/movements - Add a cash movement
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

    // Enforce "caja:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'write');

    const body = await req.json();
    const result = createMovementSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    // Call service layer to check session ownership, status, and cash outflow limits
    const movement = await CashService.addMovement(
      auth.userId,
      auth.companyId,
      id,
      result.data.type,
      result.data.amount,
      result.data.description,
      result.data.reference
    );

    return NextResponse.json(
      { success: true, data: movement },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/cash/sessions/[id]/movements:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
