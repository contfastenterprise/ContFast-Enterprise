import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, users, roles } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    const hasAccessToken = req.cookies.has('accessToken');
    const hasRefreshToken = req.cookies.has('refreshToken');
    if (hasAccessToken || hasRefreshToken) {
      const SECURE_FLAG = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      resHeaders.append(
        'Set-Cookie',
        `accessToken=; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=0`
      );
      resHeaders.append(
        'Set-Cookie',
        `refreshToken=; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=0`
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401, headers: resHeaders }
    );
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        companyId: users.companyId,
        role: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Usuario no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        data: { 
          user: {
            ...user,
            companyId: auth.companyId,
          } 
        } 
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Error interno del servidor.' } },
      { status: 500, headers: resHeaders }
    );
  }
}
