import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, accountingPeriods } from '@/db';
import { eq, and } from 'drizzle-orm';
import { enforcePermission } from '@/middleware/permissions';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'write');

    const body = await req.json();
    const { status } = body;

    if (status !== 'open' && status !== 'closed') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'El estado debe ser open o closed' } },
        { status: 400 }
      );
    }

    const [existing] = await db.select()
      .from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.id, id),
        eq(accountingPeriods.companyId, session.companyId)
      ))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Período no encontrado' } },
        { status: 404 }
      );
    }

    const [updated] = await db.update(accountingPeriods)
      .set({
        status,
        closedAt: status === 'closed' ? new Date() : null,
        closedBy: status === 'closed' ? session.userId : null,
        updatedAt: new Date()
      })
      .where(eq(accountingPeriods.id, id))
      .returning();

    return NextResponse.json({ success: true, data: updated }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error updating period:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
