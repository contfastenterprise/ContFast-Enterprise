import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, retentions } from '@/db';
import { eq, and, or, isNull } from 'drizzle-orm';

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
      .select()
      .from(retentions)
      .where(
        and(
          eq(retentions.active, true),
          or(
            isNull(retentions.companyId),
            eq(retentions.companyId, auth.companyId)
          )
        )
      );

    return NextResponse.json(
      {
        success: true,
        data: list,
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/retentions:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500, headers: resHeaders }
    );
  }
}
