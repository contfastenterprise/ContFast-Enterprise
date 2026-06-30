import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { FinancialRepository } from '@/repositories/financialRepository';
import { FinancialMovementService } from '@/services/financialMovementService';

function checkFinancialAccess(roleName: string): boolean {
  const role = roleName.toLowerCase();
  return role.includes('sistema') || role.includes('admin') || role.includes('administraci') || role === 'contabilidad';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Role verification
    if (!checkFinancialAccess(session.role)) {
      return NextResponse.json({ 
        success: false, 
        error: { 
          code: 'FORBIDDEN', 
          message: 'No tiene permisos para acceder al módulo financiero de estados de cuenta.' 
        } 
      }, { status: 403 });
    }

    const { id: customerId } = await params;
    if (!customerId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID del cliente es requerido' } }, { status: 400 });
    }

    // Auto-seed movements if empty for self-healing
    await FinancialMovementService.autoSeedMovements(session.companyId);

    // Extract query parameters for filtering
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const type = searchParams.get('type') || undefined; // 'all' | 'credit' | 'cash'
    const search = searchParams.get('search') || undefined;

    const data = await FinancialRepository.getCustomerStatement(session.companyId, customerId, {
      startDate,
      endDate,
      type,
      search
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching customer account statement:', error);
    
    if (error.message === 'Cliente no encontrado') {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: error.message } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
