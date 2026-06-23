import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers, invoiceRetentions } from '@/db';
import { eq, and, isNull, gte, lte, ne, inArray } from 'drizzle-orm';

/** GET: Return the generated 607 TXT file for download */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    let period = searchParams.get('period'); // YYYY-MM

    if (!companyId || !period) {
      return NextResponse.json({ success: false, error: { message: 'Faltan parámetros.' } }, { status: 400 });
    }
    
    // Authorization
    if (auth.role !== 'sistemas' && auth.companyId !== companyId) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
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
          isNull(invoices.deletedAt),
          gte(invoices.createdAt, start),
          lte(invoices.createdAt, end),
          ne(invoices.status, 'draft'),
          ne(invoices.status, 'void')
        )
      );

    // Fetch retentions for these invoices
    const invoiceIds = list.map((inv) => inv.id);
    const retMap: Record<string, any[]> = {};

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

    const formatAmount = (val: number | string) => {
      const num = parseFloat(String(val));
      if (isNaN(num) || num <= 0) return '';
      return num.toFixed(2).replace('.', '');
    };

    const txtLines = list.map((inv) => {
      const rnc = (inv.customerRnc || '').replace(/\D/g, '').substring(0, 11);
      const idTipo = rnc.length === 9 ? '1' : rnc.length === 11 ? '2' : '3';
      const ncf = inv.ncf.trim();
      const ncfModified = '';
      const tipoIngreso = '01'; // Standard: Ingresos por operaciones (financieros/ventas)
      const fechaFactura = inv.createdAt.toISOString().substring(0, 10).replace(/-/g, '');
      
      // Retentions calculations
      const itemRets = retMap[inv.id] || [];
      const itbisRet = itemRets.filter(r => r.retentionType === 'ITBIS').reduce((acc, curr) => acc + parseFloat(curr.retentionAmount), 0);
      const isrRet = itemRets.filter(r => r.retentionType === 'ISR').reduce((acc, curr) => acc + parseFloat(curr.retentionAmount), 0);
      const otrasRet = itemRets.filter(r => r.retentionType === 'OTRA').reduce((acc, curr) => acc + parseFloat(curr.retentionAmount), 0);

      let fechaRet = '';
      if (itemRets.length > 0) {
        const firstRet = itemRets[0];
        if (firstRet.retentionDate) {
          fechaRet = firstRet.retentionDate.replace(/-/g, '');
        } else {
          fechaRet = fechaFactura;
        }
      }

      // Amounts
      const subtotalVal = parseFloat(inv.subtotal);
      const discountVal = parseFloat(inv.discount);
      const montoFacturado = subtotalVal - discountVal;
      const itbisFacturado = parseFloat(inv.totalTaxes);

      // Net amount due / paid
      const totalNetVal = parseFloat(inv.totalNet || inv.total);

      // Payment Types columns
      let efectivo = '';
      let chequeTransferencia = '';
      let tarjeta = '';
      let credito = '';
      let bonos = '';
      let permuta = '';
      let otrasFormas = '';

      if (inv.paymentType === 'cash') {
        efectivo = formatAmount(totalNetVal);
      } else if (inv.paymentType === 'bank_transfer') {
        chequeTransferencia = formatAmount(totalNetVal);
      } else if (inv.paymentType === 'credit') {
        credito = formatAmount(totalNetVal);
      } else {
        tarjeta = formatAmount(totalNetVal);
      }

      // Format row matching DGII 607 specs (27 columns)
      return [
        rnc,                                  // Column 1: RNC/Cédula
        idTipo,                               // Column 2: Tipo Identificación
        ncf,                                  // Column 3: NCF
        ncfModified,                          // Column 4: NCF Modificado
        tipoIngreso,                          // Column 5: Tipo Ingreso
        fechaFactura,                         // Column 6: Fecha Comprobante
        fechaRet,                             // Column 7: Fecha Retención
        formatAmount(montoFacturado),         // Column 8: Monto Facturado
        formatAmount(itbisFacturado),         // Column 9: ITBIS Facturado
        formatAmount(itbisRet),               // Column 10: ITBIS Retenido por Terceros
        '',                                   // Column 11: ITBIS Sujeto a Proporcionalidad
        '',                                   // Column 12: ITBIS Retenido por Presunción
        '',                                   // Column 13: ITBIS Llevado al Costo
        '',                                   // Column 14: ITBIS por Adelantar
        '',                                   // Column 15: ITBIS Percibido
        formatAmount(isrRet),                 // Column 16: Retención Renta por Terceros / ISR
        '',                                   // Column 17: ISR Percibido
        '',                                   // Column 18: Impuesto Selectivo al Consumo
        formatAmount(otrasRet),               // Column 19: Otros Impuestos/Tasas
        '',                                   // Column 20: Propina Legal
        efectivo,                             // Column 21: Efectivo
        chequeTransferencia,                  // Column 22: Cheque/Transferencia
        tarjeta,                              // Column 23: Tarjeta
        credito,                              // Column 24: Crédito
        bonos,                                // Column 25: Bonos/Cupones
        permuta,                              // Column 26: Permuta
        otrasFormas,                          // Column 27: Otras formas de venta
      ].join('|');
    });

    const header = `607|${companyId}|${period.replace('-', '')}\n`;
    const txtContent = header + txtLines.join('\n') + (txtLines.length > 0 ? '\n' : '');

    const headers = new Headers();
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="607_${companyId}_${period}.txt"`);

    return new NextResponse(txtContent, { headers, status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
