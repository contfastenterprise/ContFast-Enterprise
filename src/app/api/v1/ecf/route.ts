import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers } from '@/db';
import { eq, and, isNull, desc, count, ilike, gte, lte, sql } from 'drizzle-orm';

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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const status = searchParams.get('status');
    const ecfType = searchParams.get('ecfType');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const q = searchParams.get('q');
    const excludeAdjusted = searchParams.get('excludeAdjusted') === 'true';

    const offset = (page - 1) * perPage;

    // Build conditions
    const conditions: any[] = [
      eq(invoices.companyId, auth.companyId),
      isNull(invoices.deletedAt),
    ];

    if (status) conditions.push(eq(invoices.status, status as any));
    if (ecfType) conditions.push(eq(invoices.ecfType, ecfType));
    if (from) {
      const fromDate = from.includes('T') ? new Date(from) : new Date(`${from}T00:00:00-04:00`);
      conditions.push(gte(invoices.createdAt, fromDate));
    }
    if (to) {
      const toDate = to.includes('T') ? new Date(to) : new Date(`${to}T23:59:59.999-04:00`);
      conditions.push(lte(invoices.createdAt, toDate));
    }
    if (q) {
      conditions.push(ilike(invoices.ncf, `%${q}%`));
    }
    if (excludeAdjusted) {
      // Find all invoice IDs that have been modified (i.e. have a note pointing to them)
      const adjustedSubquery = db
        .select({ id: invoices.modifiedInvoiceId })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, auth.companyId),
            isNull(invoices.deletedAt),
            sql`${invoices.modifiedInvoiceId} IS NOT NULL`
          )
        );
      
      // Filter out invoices whose ID is in the adjusted subquery
      conditions.push(sql`${invoices.id} NOT IN (${adjustedSubquery})`);
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ value: count() })
      .from(invoices)
      .where(whereClause);

    const data = await db
      .select({
        id: invoices.id,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        buyerRnc: invoices.buyerRnc,
        buyerName: invoices.buyerName,
        msellerTrackId: invoices.msellerTrackId,
        dgiiMessage: invoices.dgiiMessage,
        customerId: invoices.customerId,
        deliveryStatus: invoices.deliveryStatus,
        modifiedNcf: invoices.modifiedNcf,
        modifiedInvoiceId: invoices.modifiedInvoiceId,
        createdAt: invoices.createdAt,
        xmlPath: invoices.xmlPath,
        signedXmlPath: invoices.signedXmlPath,
        msellerXmlPath: invoices.msellerXmlPath,
      })
      .from(invoices)
      .where(whereClause)
      .orderBy(desc(invoices.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    return NextResponse.json(
      {
        success: true,
        data,
        meta: {
          page,
          per_page: perPage,
          total,
          total_pages: Math.ceil(total / perPage),
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/ecf:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
