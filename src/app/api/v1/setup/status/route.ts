import { NextResponse } from 'next/server';
import { db, companies } from '@/db';
import { count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await db.select({ value: count() }).from(companies);
    const totalCompanies = result[0]?.value || 0;

    return NextResponse.json({
      success: true,
      data: {
        initialized: totalCompanies > 0
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/setup/status:', error);
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
