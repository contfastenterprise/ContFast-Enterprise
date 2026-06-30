import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { FinancialRepository } from '@/repositories/financialRepository';
import { FinancialMovementService } from '@/services/financialMovementService';

function checkFinancialAccess(roleName: string): boolean {
  const role = roleName.toLowerCase();
  return role.includes('sistema') || role.includes('admin') || role.includes('administraci') || role === 'contabilidad';
}

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

    // Auto-seed movements if empty for self-healing
    await FinancialMovementService.autoSeedMovements(session.companyId);

    const data = await FinancialRepository.getFinancialDashboard(session.companyId);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching financial dashboard metrics:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
