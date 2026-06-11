import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, clearSession } from '@/middleware/auth';
import { db, auditLogs } from '@/db';

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const authPayload = await verifyAuth(req, resHeaders);

  if (!authPayload) {
    // If there is no active session payload, we still want to make sure the client cookies are cleared
    const clearHeaders = new Headers();
    clearHeaders.append('Set-Cookie', 'accessToken=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    clearHeaders.append('Set-Cookie', 'refreshToken=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return NextResponse.json(
      { success: true, message: 'Sesión no activa o ya expirada. Cookies limpiadas.' },
      { status: 200, headers: clearHeaders }
    );
  }

  try {
    // Clear the session and set cookie expiration headers
    await clearSession(authPayload.sessionId, resHeaders);

    // Record audit log
    await db.insert(auditLogs).values({
      companyId: authPayload.companyId,
      userId: authPayload.userId,
      action: 'logout',
      entityType: 'users',
      entityId: authPayload.userId,
      ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
    });

    return NextResponse.json(
      { success: true, message: 'Sesión cerrada exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Error interno al cerrar sesión.' } },
      { status: 500 }
    );
  }
}
