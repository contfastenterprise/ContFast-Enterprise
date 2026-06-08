import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices } from '@/db';
import { eq, and, isNull, gte, lte, sum, count, sql } from 'drizzle-orm';

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const { searchParams } = new URL(req.url);

    // Default: current month
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : defaultFrom;
    const to = searchParams.get('to')
      ? (() => { const d = new Date(searchParams.get('to')!); d.setHours(23, 59, 59, 999); return d; })()
      : defaultTo;

    const baseConditions = and(
      eq(invoices.companyId, auth.companyId),
      isNull(invoices.deletedAt),
      gte(invoices.createdAt, from),
      lte(invoices.createdAt, to)
    );

    // Totals
    const [totals] = await db
      .select({
        totalAmount: sum(invoices.total),
        totalITBIS: sum(invoices.totalTaxes),
        totalCount: count(),
      })
      .from(invoices)
      .where(baseConditions);

    // By status
    const byStatusRows = await db
      .select({
        status: invoices.status,
        cnt: count(),
      })
      .from(invoices)
      .where(baseConditions)
      .groupBy(invoices.status);

    const byStatus: Record<string, number> = {};
    byStatusRows.forEach((r) => { byStatus[r.status] = Number(r.cnt); });

    // By ecfType
    const byTypeRows = await db
      .select({
        ecfType: invoices.ecfType,
        cnt: count(),
        amount: sum(invoices.total),
      })
      .from(invoices)
      .where(baseConditions)
      .groupBy(invoices.ecfType);

    const byType: Record<string, { count: number; amount: string }> = {};
    byTypeRows.forEach((r) => {
      byType[r.ecfType] = { count: Number(r.cnt), amount: r.amount || '0' };
    });

    const totalCountNum = Number(totals?.totalCount || 0);
    const acceptedCount = byStatus['accepted'] || 0;
    const approvalRate = totalCountNum > 0 ? Math.round((acceptedCount / totalCountNum) * 100) : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          totalAmount: totals?.totalAmount || '0',
          totalITBIS: totals?.totalITBIS || '0',
          totalCount: totalCountNum,
          byType,
          byStatus,
          approvalRate,
          period: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/ecf/stats:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
