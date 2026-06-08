import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
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
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'El accountId es requerido' } }, { status: 400 });
    }

    const transactions = await BankRepository.getBankTransactions(session.companyId, accountId);

    return NextResponse.json({ success: true, data: transactions });
  } catch (error: any) {
    console.error('Error fetching bank transactions:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = registerTxSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const transaction = await BankRepository.registerTransaction({
      ...parsed.data,
      companyId: session.companyId
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering bank transaction:', error);
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
