import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, permissions } from '@/db';

/**
 * GET /api/v1/admin/permissions - Get the full catalog of system permissions
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
    const list = await db
      .select({
        id: permissions.id,
        module: permissions.module,
        action: permissions.action,
        description: permissions.description,
      })
      .from(permissions);

    return NextResponse.json(
      { success: true, data: list },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/permissions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
