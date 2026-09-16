import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { BankRepository } from '@/repositories/bankRepository';

/**
 * Lote 151: las cuentas bancarias donde puede entrar un cobro, para el selector
 * de la pantalla de cobros. Con el permiso de COBRAR, no el de banco: quien
 * registra un cobro tiene que poder decir en que banco entro, sin ver saldos
 * (ver `BankRepository.cuentasParaCobrar`).
 */
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

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'cobros', 'write');

    const cuentas = await BankRepository.cuentasParaCobrar(session.companyId);
    return NextResponse.json({ success: true, data: cuentas });
  } catch (error: unknown) {
    const e = error as Error & { status?: number };
    console.error('Error fetching bank accounts for receipts:', error);
    return NextResponse.json(
      { success: false, error: { code: e.status === 403 ? 'INSUFFICIENT_PERMISSIONS' : 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500 }
    );
  }
}
