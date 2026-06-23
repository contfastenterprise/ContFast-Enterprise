import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers } from '@/db';
import { eq, and, isNull, gte, lte, desc, ne } from 'drizzle-orm';

/**
 * GET /api/v1/reports/sales-book - e-CF Sales Book report (DGII Formato 607 equivalent)
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
    // Enforce "reportes:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_DATE_RANGE', message: 'Los parámetros start_date y end_date son requeridos.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // Fetch invoices in date range (exclude drafts and voided for tax purposes)
    const list = await db
      .select({
        id: invoices.id,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        status: invoices.status,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        totalRetained: invoices.totalRetained,
        totalNet: invoices.totalNet,
        createdAt: invoices.createdAt,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoices.companyId, auth.companyId),
          isNull(invoices.deletedAt),
          gte(invoices.createdAt, new Date(startDateStr + 'T00:00:00-04:00')),
          lte(invoices.createdAt, new Date(endDateStr + 'T23:59:59.999-04:00')),
          ne(invoices.status, 'draft'),
          ne(invoices.status, 'void')
        )
      )
      .orderBy(desc(invoices.createdAt));

    // Calculate report aggregates
    let totalSubtotal = 0;
    let totalDiscount = 0;
    let totalITBIS = 0;
    let totalAmount = 0;
    let totalRetained = 0;
    let totalNet = 0;
    let totalCount = list.length;

    list.forEach((inv) => {
      totalSubtotal += parseFloat(inv.subtotal);
      totalDiscount += parseFloat(inv.discount);
      totalITBIS += parseFloat(inv.totalTaxes);
      totalAmount += parseFloat(inv.total);
      totalRetained += parseFloat(inv.totalRetained);
      totalNet += parseFloat(inv.totalNet);
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          summary: {
            start_date: startDateStr,
            end_date: endDateStr,
            invoice_count: totalCount,
            subtotal: totalSubtotal,
            discount: totalDiscount,
            itbis: totalITBIS,
            total: totalAmount,
            totalRetained,
            totalNet,
          },
          invoices: list,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/reports/sales-book:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
