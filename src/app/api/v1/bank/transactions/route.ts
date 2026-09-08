import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { BankRepository } from '@/repositories/bankRepository';
import { z } from 'zod';

const registerTxSchema = z.object({
  bankAccountId: z.string().uuid(),
  date: z.string().min(1),
  type: z.enum(['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee']),
  amount: z.number().min(0.01),
  reference: z.string().optional(),
  description: z.string().optional(),
  contraAccountId: z.string().uuid().optional()
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

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'banco', 'read');
    if (denegado) return denegado;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!accountId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'El accountId es requerido' } }, { status: 400 });
    }

    // Auditoria P2-39 (2026-09-03): el filtro por fechas se hacia AQUI, en
    // memoria, sobre el libro entero que se acababa de traer de la base de
    // datos. Ahora va en el SQL. `limit` es opcional: quien no lo pide -- la
    // conciliacion bancaria, que necesita todos los movimientos de la cuenta --
    // sigue recibiendo todo, y quien lo pide recibe ademas el total para poder
    // avisar en pantalla de que esta viendo solo una parte.
    const limitPedido = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitPedido) ? Math.min(Math.max(limitPedido, 1), 1000) : undefined;

    const { transactions, total } = await BankRepository.getBankTransactions(
      session.companyId,
      accountId,
      session.modo,
      { startDate: startDate || undefined, endDate: endDate || undefined, limit }
    );

    return NextResponse.json({
      success: true,
      data: transactions,
      meta: { total, limit: limit ?? null, truncado: total > transactions.length },
    });
  } catch (error: unknown) {
    console.error('Error fetching bank transactions:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } },
      { status: 500 }
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

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'banco', 'write');
    if (denegado) return denegado;

    const body = await req.json();
    const parsed = registerTxSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const transaction = await BankRepository.registerTransaction({
      // Auditoria JRN-16: quien registra el movimiento y su asiento.
      createdBy: session.userId,
      ...parsed.data,
      companyId: session.companyId,
      modo: session.modo
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error registering bank transaction:', error);
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: (error as Error).message } },
      { status: 400 }
    );
  }
}
