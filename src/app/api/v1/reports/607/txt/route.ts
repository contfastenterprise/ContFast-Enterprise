import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers, invoiceRetentions, companies } from '@/db';
import { eq, and, isNull, gte, lte, inArray, notInArray } from 'drizzle-orm';
import { ESTADOS_FUERA_DEL_607 } from '@/services/dgii/estadosReportables';
import { txtDel607, nombreFichero607, type RetencionDeVenta607 } from '@/services/dgii/formato607';

/** GET: Return the generated 607 TXT file for download */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    // Como en el 606: la sesion ya dice de que empresa es, asi que la pantalla
    // no tiene que ir antes a `auth/me` a preguntarselo. Se sigue admitiendo
    // `companyId` para el rol `sistemas`, y la comprobacion de abajo no cambia.
    const companyId = searchParams.get('companyId') || auth.companyId;
    let period = searchParams.get('period'); // YYYY-MM

    if (!period) {
      return NextResponse.json({ success: false, error: { message: 'Faltan parámetros.' } }, { status: 400 });
    }

    // Authorization
    if (auth.role !== 'sistemas' && auth.companyId !== companyId) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    // Lote 142: la cabecera del 607 lleva el RNC de quien remite (Anexo B de
    // la NG 07-2018). Salia el id interno de la empresa.
    const [empresa] = await db
      .select({ rnc: companies.rnc })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!empresa) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada.' } }, { status: 404 });
    }

    const [year, month] = period.split('-');
    const start = new Date(`${year}-${month}-01T00:00:00-04:00`);
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const end = new Date(`${year}-${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999-04:00`);

    const list = await db
      .select({
        id: invoices.id,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        totalRetained: invoices.totalRetained,
        totalNet: invoices.totalNet,
        paymentType: invoices.paymentType,
        createdAt: invoices.createdAt,
        customerRnc: customers.rncCedula,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoices.companyId, companyId),
          // `modo` tiene DEFAULT 'PRODUCCION': sin este filtro el fichero que
          // se remite a la DGII incluia los comprobantes emitidos en PRUEBA,
          // indistinguibles de los reales.
          eq(invoices.modo, auth.modo),
          isNull(invoices.deletedAt),
          gte(invoices.createdAt, start),
          lte(invoices.createdAt, end),
          // Lote 141: fuera tambien los rechazados. La lista vive en
          // `estadosReportables.ts`, compartida con el libro de ventas.
          notInArray(invoices.status, ESTADOS_FUERA_DEL_607)
        )
      );

    // Fetch retentions for these invoices
    const invoiceIds = list.map((inv) => inv.id);
    const retMap: Record<string, RetencionDeVenta607[]> = {};

    if (invoiceIds.length > 0) {
      const allRet = await db
        .select()
        .from(invoiceRetentions)
        .where(inArray(invoiceRetentions.invoiceId, invoiceIds));

      allRet.forEach((r) => {
        if (!retMap[r.invoiceId]) {
          retMap[r.invoiceId] = [];
        }
        retMap[r.invoiceId].push(r);
      });
    }

    // Lote 142: el fichero lo arma `formato607.ts`, conforme al Anexo B --
    // cabecera con RNC y cantidad, 23 campos, importes con punto decimal.
    // Ver alli lo que cambio y lo que se conserva a proposito.
    const txtContent = txtDel607({
      rncEmisor: empresa.rnc,
      periodo: period,
      comprobantes: list.map((inv) => ({ ...inv, retenciones: retMap[inv.id] || [] })),
    });

    const headers = new Headers();
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="${nombreFichero607(empresa.rnc, period)}"`);

    return new NextResponse(txtContent, { headers, status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
  }
}
