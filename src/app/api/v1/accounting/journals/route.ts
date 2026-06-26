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

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'read');

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const journals = await AccountingRepository.getJournalEntries(session.companyId, 100, startDate, endDate);

    return NextResponse.json({ success: true, data: journals }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching journals:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
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

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'write');

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
      reference: parsed.data.reference || undefined
    });

    return NextResponse.json({ success: true, data: newJournal }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error creating journal entry:', error);
    const status = error.status || 400;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'BAD_REQUEST', message: error.message } },
      { status }
    );
  }
}
