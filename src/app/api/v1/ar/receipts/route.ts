import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { withIdempotency } from '@/lib/idempotency';
import { ArRepository } from '@/repositories/arRepository';
import { z } from 'zod';

const registerReceiptSchema = z.object({
  customerId: z.string().uuid('ID de cliente inválido'),
  date: z.string().min(1, 'La fecha es requerida'),
  paymentMethod: z.enum(['cash', 'bank', 'check', 'card']),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  invoicesApplied: z.array(z.object({
    arId: z.string().uuid(),
    amountApplied: z.number().min(0.01)
  })).min(1, 'Debe aplicar el cobro a al menos una factura')
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

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'cobros', 'read');

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const search = searchParams.get('search') || undefined;

    const receipts = await ArRepository.getReceiptsList(session.companyId, session.modo, { startDate, endDate, search });

    return NextResponse.json({ success: true, data: receipts });
  } catch (error: any) {
    console.error('Error fetching receipts:', error);
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

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'cobros', 'write');

    const body = await req.json();
    const parsed = registerReceiptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    // Verify sum of applied amounts equals total amount
    const totalApplied = parsed.data.invoicesApplied.reduce((sum, inv) => sum + inv.amountApplied, 0);
    if (Math.abs(totalApplied - parsed.data.amount) > 0.01) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'La suma del monto aplicado a las facturas no coincide con el total del recibo.' } },
        { status: 400 }
      );
    }

    // Auditoria P1-11: un reintento de red o doble clic aqui registra un
    // segundo cobro. Si el cliente manda `Idempotency-Key`, un reintento
    // con la misma clave devuelve la respuesta ya guardada en vez de
    // cobrar de nuevo.
    const { status, body: respBody } = await withIdempotency(
      { companyId: session.companyId, modo: session.modo, route: 'POST /api/v1/ar/receipts', idempotencyKey: req.headers.get('Idempotency-Key') },
      async () => {
        const receipt = await ArRepository.registerReceipt({
          ...parsed.data,
          companyId: session.companyId,
          modo: session.modo,
          userId: session.userId,
          reference: parsed.data.reference || undefined,
          notes: parsed.data.notes || undefined
        });
        return { status: 201, body: { success: true, data: receipt } };
      }
    );

    return NextResponse.json(respBody, { status });
  } catch (error: any) {
    console.error('Error registering receipt:', error);
    
    if (error.message.includes('sesión de caja abierta')) {
      return NextResponse.json(
        { success: false, error: { code: 'CASH_SESSION_CLOSED', message: error.message } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
