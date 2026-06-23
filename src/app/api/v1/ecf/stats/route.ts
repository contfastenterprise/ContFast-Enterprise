import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices } from '@/db';
import { eq, and, isNull, gte, lte, sum, count, sql } from 'drizzle-orm';

function getDRCurrentDateParts() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10)
  };
}

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

    // Default: current month in Dominican Republic timezone
    const drDate = getDRCurrentDateParts();
    const defaultFrom = new Date(`${drDate.year}-${String(drDate.month).padStart(2, '0')}-01T00:00:00-04:00`);
    const lastDayOfMonth = new Date(drDate.year, drDate.month, 0).getDate();
    const defaultTo = new Date(`${drDate.year}-${String(drDate.month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59.999-04:00`);

    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const from = fromParam
      ? (fromParam.includes('T') ? new Date(fromParam) : new Date(`${fromParam}T00:00:00-04:00`))
      : defaultFrom;
    const to = toParam
      ? (toParam.includes('T') ? new Date(toParam) : new Date(`${toParam}T23:59:59.999-04:00`))
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
