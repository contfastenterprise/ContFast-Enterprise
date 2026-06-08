import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { ApService } from '@/services/apService';
import { z } from 'zod';

const registerPaymentSchema = z.object({
  apId: z.string().uuid('ID de cuenta por pagar inválido'),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  paymentMethod: z.enum(['cash', 'transfer', 'check']),
  debitAccountId: z.string().uuid('Debe seleccionar una cuenta de débito válida.'),
  creditAccountId: z.string().uuid('Debe seleccionar una cuenta de crédito válida.'),
  paymentDate: z.string().transform((val) => new Date(val)),
  bankAccountId: z.string().uuid().optional().nullable(),
  checkNumber: z.string().optional().nullable(),
  payee: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable().transform((val) => (val ? new Date(val) : undefined)),
  isGuarantee: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = registerPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const result = await ApService.registerPayment({
      ...parsed.data,
      companyId: session.companyId,
      bankAccountId: parsed.data.bankAccountId || undefined,
      checkNumber: parsed.data.checkNumber || undefined,
      payee: parsed.data.payee || undefined,
      dueDate: parsed.data.dueDate || undefined,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering payment:', error);
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
