import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, cashSessions, cashSessionSummary } from '@/db';
import { eq, and } from 'drizzle-orm';

export async function GET(
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

    // Enforce "caja:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'read');

    // Fetch cash session
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

    // Cajero visibility restriction
    if (auth.role.toLowerCase().includes('cajero') && session.userId !== auth.userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Como cajero, solo puede visualizar el resumen de su propia sesión.' } },
        { status: 403, headers: resHeaders }
      );
    }

    // Fetch summary
    const [summary] = await db
      .select()
      .from(cashSessionSummary)
      .where(and(eq(cashSessionSummary.cashSessionId, id), eq(cashSessionSummary.companyId, auth.companyId)))
      .limit(1);

    if (!summary) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Resumen no generado para esta sesión. Primero debe cerrarse.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: summary },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/cash/sessions/[id]/summary:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
