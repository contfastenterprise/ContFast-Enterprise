import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, accountingPeriods, auditLogs } from '@/db';
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

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'contabilidad', 'write');

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
      // Esto es ESCRITURA: abajo se abre o se cierra el periodo. Sin el
      // entorno, desde PRODUCCION se podia cerrar el periodo contable de
      // PRUEBA y al reves, bastando el id que devolvia el listado sin filtrar.
      .where(and(
        eq(accountingPeriods.id, id),
        eq(accountingPeriods.companyId, session.companyId),
        eq(accountingPeriods.modo, session.modo)
      ))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Período no encontrado' } },
        { status: 404 }
      );
    }

    // Auditoria P2-32 (2026-09-07): reabrir un periodo pisaba closedAt/
    // closedBy sin dejar rastro de quien lo habia cerrado ni cuando -- se
    // registra el estado previo COMPLETO en audit_logs antes de
    // sobrescribirlo, en la misma transaccion que el cambio de estado.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(accountingPeriods)
        .set({
          status,
          closedAt: status === 'closed' ? new Date() : null,
          closedBy: status === 'closed' ? session.userId : null,
          updatedAt: new Date()
        })
        .where(eq(accountingPeriods.id, id))
        .returning();

      await tx.insert(auditLogs).values({
        companyId: session.companyId,
        modo: session.modo,
        userId: session.userId,
        action: status === 'closed' ? 'close_accounting_period' : 'reopen_accounting_period',
        entityType: 'accounting_periods',
        entityId: id,
        oldValues: { status: existing.status, closedAt: existing.closedAt, closedBy: existing.closedBy },
        newValues: { status: row.status, closedAt: row.closedAt, closedBy: row.closedBy },
      });

      return row;
    });

    return NextResponse.json({ success: true, data: updated }, { headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error updating period:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
