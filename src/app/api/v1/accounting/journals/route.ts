import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { enforcePermission } from '@/middleware/permissions';
import { z } from 'zod';

const createJournalSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  reference: z.string().optional().nullable(),
  description: z.string().min(1, 'La descripción es requerida'),
  lines: z.array(z.object({
    accountId: z.string().uuid('ID de cuenta inválido'),
    debit: z.number().min(0),
    credit: z.number().min(0),
  })).min(2, 'Debe haber al menos 2 líneas de movimiento'),
});

export async function GET(req: NextRequest) {
  try {
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

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'contabilidad', 'read');

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    // Auditoria P2-40 (2026-09-03): el limite estaba cableado a 100 y la
    // respuesta no decia el total, asi que la pantalla pintaba 100 asientos sin
    // manera de saber si habia mas. Ahora el limite se puede pedir -- acotado a
    // 500, para no cambiar un corte silencioso por una lectura sin techo -- y la
    // respuesta dice cuantos hay en el rango y si se ha truncado.
    const limitPedido = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(limitPedido) ? Math.min(Math.max(limitPedido, 1), 500) : 100;

    const { entries, total } = await AccountingRepository.getJournalEntries(
      session.companyId,
      session.modo,
      limit,
      startDate,
      endDate
    );

    return NextResponse.json(
      { success: true, data: entries, meta: { total, limit, truncado: total > entries.length } },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error fetching journals:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const parsed = createJournalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newJournal = await AccountingRepository.createJournalEntry({
      ...parsed.data,
      companyId: session.companyId,
      // Auditoria JRN-09: sin `modo`, la columna aplicaba su DEFAULT
      // 'PRODUCCION' y los asientos manuales registrados en el entorno de
      // PRUEBA se sellaban como reales, sin ningun aviso. Ademas la validacion
      // de periodo abierto se hacia contra los periodos de PRODUCCION.
      modo: session.modo,
      // Auditoria JRN-16: quien registra el asiento.
      createdBy: session.userId,
      reference: parsed.data.reference || undefined
    });

    return NextResponse.json({ success: true, data: newJournal }, { status: 201, headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error creating journal entry:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 400;
    return NextResponse.json(
      { success: false, error: { code: e.code || 'BAD_REQUEST', message: e.message } },
      { status }
    );
  }
}
