import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, dgiiSubmissions, invoices } from '@/db';
import { eq, and, desc, count } from 'drizzle-orm';

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
    const perPage = parseInt(searchParams.get('per_page') || '50', 10);
    const offset = (page - 1) * perPage;

    const [totalResult] = await db
      .select({ value: count() })
      .from(dgiiSubmissions)
      .where(eq(dgiiSubmissions.companyId, auth.companyId));

    const submissions = await db
      .select({
        id: dgiiSubmissions.id,
        invoiceId: dgiiSubmissions.invoiceId,
        trackId: dgiiSubmissions.trackId,
        status: dgiiSubmissions.status,
        responseCode: dgiiSubmissions.responseCode,
        responseMessage: dgiiSubmissions.responseMessage,
        retryCount: dgiiSubmissions.retryCount,
        createdAt: dgiiSubmissions.createdAt,
        updatedAt: dgiiSubmissions.updatedAt,
        // Invoice fields
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        invoiceStatus: invoices.status,
        total: invoices.total,
      })
      .from(dgiiSubmissions)
      .leftJoin(invoices, eq(dgiiSubmissions.invoiceId, invoices.id))
      .where(eq(dgiiSubmissions.companyId, auth.companyId))
      .orderBy(desc(dgiiSubmissions.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    return NextResponse.json(
      {
        success: true,
        data: submissions,
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
    console.error('Error in GET /api/v1/ecf/queue:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
