import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers } from '@/db';
import { eq, and, isNull, desc, count, sql, notInArray, type SQL } from 'drizzle-orm';
import { condicionesDelFiltro, filtroDeParametros } from '@/services/dgii/filtroDelListadoEcf';

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
    const excludeAdjusted = searchParams.get('excludeAdjusted') === 'true';

    const offset = (page - 1) * perPage;

    // Las condiciones del filtro viven en `filtroDelListadoEcf` (lote 260):
    // la sincronizacion de todo el filtro usa las MISMAS, para consultar
    // exactamente lo que esta pantalla lista.
    const conditions: SQL[] = condicionesDelFiltro(
      { companyId: auth.companyId, modo: auth.modo },
      filtroDeParametros(searchParams)
    );

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
  } catch (error: unknown) {
    console.error('Error in GET /api/v1/ecf:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
