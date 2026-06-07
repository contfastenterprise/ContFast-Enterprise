import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, roles } from '@/db';
import { eq, and, isNull, or } from 'drizzle-orm';

/**
 * GET /api/v1/admin/roles - Get list of roles in the company
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

    // Fetch all roles for this company (or system-wide roles)
    const list = await db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isFixed: roles.isFixed,
        createdAt: roles.createdAt,
      })
      .from(roles)
      .where(
        and(
          or(
            eq(roles.companyId, auth.companyId),
            isNull(roles.companyId)
          ),
          isNull(roles.deletedAt)
        )
      );

    return NextResponse.json(
      { success: true, data: list },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/roles:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
