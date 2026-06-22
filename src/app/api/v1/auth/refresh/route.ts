import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, users, roles } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const authPayload = await verifyAuth(req, resHeaders);

  if (!authPayload) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada. Por favor inicie sesión.' } },
      { status: 401 }
    );
  }

  try {
    // Return active user details
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        companyId: users.companyId,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, authPayload.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'El usuario no existe.' } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.roleName,
            companyId: authPayload.companyId,
          },
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Refresh token error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Error interno en el servidor.' } },
      { status: 500 }
    );
  }
}
