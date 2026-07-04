import { NextRequest, NextResponse } from 'next/server';
import { db, sessions, users, roles } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const isSystemRole = session.role?.toLowerCase() === 'sistemas' || session.role?.toLowerCase() === 'sistema';
    if (!isSystemRole) {
      return NextResponse.json({ success: false, error: { message: 'Permiso denegado. Solo el rol sistemas puede acceder.' } }, { status: 403 });
    }

    const activeSessions = await db
      .select({
        id: sessions.id,
        userName: users.name,
        userEmail: users.email,
        roleName: roles.name,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        invalidatedAt: sessions.invalidatedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(sessions.companyId, session.companyId))
      .orderBy(desc(sessions.createdAt))
      .limit(100);

    return NextResponse.json({ success: true, data: activeSessions });
  } catch (err: any) {
    console.error('Error fetching sessions:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const isSystemRole = session.role?.toLowerCase() === 'sistemas' || session.role?.toLowerCase() === 'sistema';
    if (!isSystemRole) {
      return NextResponse.json({ success: false, error: { message: 'Permiso denegado' } }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json({ success: false, error: { message: 'Falta el id de sesión' } }, { status: 400 });
    }

    await db
      .update(sessions)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.companyId, session.companyId)
        )
      );

    return NextResponse.json({ success: true, message: 'Sesión finalizada exitosamente.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
