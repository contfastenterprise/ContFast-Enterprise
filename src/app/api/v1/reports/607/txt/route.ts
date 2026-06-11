import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, customers } from '@/db';
import { eq, and, isNull, gte, lte, ne } from 'drizzle-orm';

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
    const start = new Date(`${year}-${month}-01T00:00:00Z`);
    const end = new Date(new Date(Number(year), Number(month), 1).getTime() - 1); // Last day of month

    const list = await db
      .select({
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
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

    const txtLines = list.map((inv) => {
      // Basic 607 line representation
      const rnc = (inv.customerRnc || '').padEnd(11, ' ').substring(0, 11);
      const idTipo = rnc.trim().length === 9 ? '1' : rnc.trim().length === 11 ? '2' : '3';
      const ncf = inv.ncf.padEnd(19, ' ');
      const ncfModified = ''.padEnd(19, ' ');
      const fecha = inv.createdAt.toISOString().substring(0, 10).replace(/-/g, '');
      const itbisFacturado = Number(inv.totalTaxes).toFixed(2).replace('.', '');
      const montoFacturado = Number(inv.total).toFixed(2).replace('.', '');

      return `${rnc}|${idTipo}|${ncf}|${ncfModified}|01|${fecha}||${itbisFacturado}||${montoFacturado}`;
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
