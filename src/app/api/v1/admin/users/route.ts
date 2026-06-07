import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, users, roles } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * GET /api/v1/admin/users - Get list of users in the company
 */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "administracion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'administracion', 'read');

    // Fetch all users for this company
    const list = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        roleId: users.roleId,
        roleName: roles.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(
        and(
          eq(users.companyId, auth.companyId),
          isNull(users.deletedAt)
        )
      );

    return NextResponse.json(
      { success: true, data: list },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/users:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
