import { NextRequest, NextResponse } from 'next/server';
import { db, routeMappings } from '@/db';
import { verifyAuth } from '@/middleware/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
        { status: 401 }
      );
    }

    const mappings = await db.select().from(routeMappings);

    return NextResponse.json({
      success: true,
      data: mappings,
    });
  } catch (err: any) {
    console.error('[Route Mappings API Error]:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
