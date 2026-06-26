import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { BankRepository } from '@/repositories/bankRepository';
import { z } from 'zod';

const createAccountSchema = z.object({
  bankName: z.string().min(2, 'El nombre del banco es requerido'),
  accountNumber: z.string().min(4, 'El número de cuenta es requerido'),
  currency: z.string().min(3),
  type: z.string().min(2),
  color: z.string().optional(),
  initialBalance: z.number()
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

    const accounts = await BankRepository.getBankAccounts(session.companyId);

    return NextResponse.json({ success: true, data: accounts });
  } catch (error: any) {
    console.error('Error fetching bank accounts:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
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

    const body = await req.json();
    const parsed = createAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newAccount = await BankRepository.createBankAccount({
      ...parsed.data,
      companyId: session.companyId
    });

    return NextResponse.json({ success: true, data: newAccount }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating bank account:', error);
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
