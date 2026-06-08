import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { z } from 'zod';

const createAccountSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const accounts = await AccountingRepository.getChartOfAccounts(session.companyId);

    return NextResponse.json({ success: true, data: accounts });
  } catch (error: any) {
    console.error('Error fetching accounts:', error);
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
    const parsed = createAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newAccount = await AccountingRepository.createAccount({
      ...parsed.data,
      companyId: session.companyId,
      parentId: parsed.data.parentId || undefined
    });

    return NextResponse.json({ success: true, data: newAccount }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating account:', error);
    const isDuplicate = error.message.includes('ya existe');
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : 'SERVER_ERROR', message: error.message } },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
