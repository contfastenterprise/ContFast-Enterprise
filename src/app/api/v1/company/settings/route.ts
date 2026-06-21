import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CompanyRepository } from '@/repositories/companyRepository';

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const settings = await CompanyRepository.getSettings(session.companyId);
    const company = await CompanyRepository.getProfile(session.companyId);

    if (!settings) {
      return NextResponse.json({ success: false, error: { message: 'Configuración no encontrada' } }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...settings,
        companyName: company?.name || null,
        rnc: company?.rnc || null,
        address: company?.address || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message || 'Error interno' } },
      { status: 500 }
    );
  }
}
