import { NextRequest, NextResponse } from 'next/server';
import { db, expenseTypes } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { eq, and } from 'drizzle-orm';

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

    const types = await db
      .select({
        id: expenseTypes.id,
        code: expenseTypes.code,
        name: expenseTypes.name,
        status: expenseTypes.status
      })
      .from(expenseTypes)
      .where(and(
        eq(expenseTypes.companyId, session.companyId),
        eq(expenseTypes.status, 'active')
      ));

    // Sort by code ascending
    types.sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({ success: true, data: types });
  } catch (err: any) {
    console.error('Error fetching expense types:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
