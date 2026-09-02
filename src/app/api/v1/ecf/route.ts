import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers } from '@/db';
import { eq, and, isNull, desc, count, ilike, gte, lte, sql, notInArray } from 'drizzle-orm';

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

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
      eq(invoices.modo, auth.modo),
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
      //  UNA NOTA RECHAZADA NO AJUSTO NADA.
      //
      //  Esto excluia toda factura que tuviera una nota apuntandole, MIRARA EL
      //  ESTADO O NO. Una nota que la DGII rechazo cuenta igual que una
      //  aceptada, asi que la factura original desaparece del buscador PARA
      //  SIEMPRE y no hay forma de volver a emitirle la nota.
      //
      //  Pasado de verdad: la nota E340000000002 se rechazo por el orden de los
      //  campos de `Totales`, y su factura dejo de aparecer. El sistema dejaba
      //  al usuario sin salida por un documento que no llego a existir.
      //
      //  Una nota rechazada consumio un numero y nada mas: no modifico ningun
      //  comprobante. Lo mismo una anulada. Las que si cuentan son las que
      //  existen o pueden acabar existiendo -- aceptada, enviada, firmada --
      //  porque emitir una segunda mientras una esta en vuelo si seria
      //  duplicar el ajuste.
      const ESTADOS_QUE_NO_AJUSTAN = ['rejected', 'void'];

      const adjustedSubquery = db
        .select({ id: invoices.modifiedInvoiceId })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, auth.companyId),
            eq(invoices.modo, auth.modo),
            isNull(invoices.deletedAt),
            sql`${invoices.modifiedInvoiceId} IS NOT NULL`,
            notInArray(invoices.status, ESTADOS_QUE_NO_AJUSTAN as any)
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
