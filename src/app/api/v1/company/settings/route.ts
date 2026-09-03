import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CompanyRepository } from '@/repositories/companyRepository';
import { enforcePermission } from '@/middleware/permissions';

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
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    // Auditoria P1-15 (2026-09-03): esta ruta solo comprobaba que hubiera
    // sesion valida, sin exigir ningun permiso -- cualquier usuario
    // autenticado, del rol que fuera, podia leer estos ajustes.
    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'administracion', 'read');

    const settings = await CompanyRepository.getSettings(session.companyId);
    const company = await CompanyRepository.getProfile(session.companyId);

    if (!settings) {
      return NextResponse.json({ success: false, error: { message: 'Configuración no encontrada' } }, { status: 404 });
    }

    // Auditoria P1-15: `...settings` exponia tal cual las credenciales de
    // mSeller (el correo y el blob cifrado de API key/password) a cualquier
    // usuario con permiso de lectura de administracion. El cifrado
    // AES-256-GCM limita el dano mientras la clave maestra no se filtre, pero
    // no hay razon para mandarlas al navegador: nada en el cliente las usa.
    const {
      msellerApiKeyEncrypted,
      msellerEmail,
      msellerPasswordEncrypted,
      ...settingsSinCredencialesMseller
    } = settings;

    return NextResponse.json({
      success: true,
      data: {
        ...settingsSinCredencialesMseller,
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
