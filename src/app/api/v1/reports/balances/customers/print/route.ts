import { NextRequest, NextResponse } from 'next/server';
import { db, accountsReceivable, customers, companies } from '@/db';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { PdfGenerator } from '@/services/print/pdfGenerator';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(auth, 'cobros', 'read');
    if (denegado) return denegado;
    const { companyId, modo } = auth;

    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId');

    // 1. Fetch Company Info
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // 2. Build Query
    let queryConditions = and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      isNull(accountsReceivable.deletedAt),
      gt(accountsReceivable.balance, '0')
    );

    if (customerId && customerId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsReceivable.customerId, customerId));
    }

    // 3. Fetch Items
    const items = await db
      .select({
        balance: accountsReceivable.balance,
        dueDate: accountsReceivable.dueDate,
        customerId: accountsReceivable.customerId,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
      })
      .from(accountsReceivable)
      .leftJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .where(queryConditions);

    // 4. Aggregate
    const grouped: Record<string, any> = {};
    const now = new Date();
    
    items.forEach(item => {
      const cid = item.customerId || 'unknown';
      if (!grouped[cid]) {
        grouped[cid] = {
          customerId: cid,
          customerName: item.customerName || 'Desconocido',
          customerRnc: item.customerRnc || 'N/A',
          totalBalance: 0,
          overdueBalance: 0,
          overdue1to30: 0,
          overdue31to60: 0,
          overdue61Plus: 0,
        };
      }
      
      const bal = Number(item.balance);
      grouped[cid].totalBalance += bal;
      
      const dueDate = new Date(item.dueDate);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        grouped[cid].overdueBalance += bal;
        if (diffDays <= 30) {
          grouped[cid].overdue1to30 += bal;
        } else if (diffDays <= 60) {
          grouped[cid].overdue31to60 += bal;
        } else {
          grouped[cid].overdue61Plus += bal;
        }
      }
    });

    const aggregatedItems = Object.values(grouped);

    // 5. Generate HTML and PDF
    const html = DocumentTemplates.renderCustomerBalancesReport({
      company,
      items: aggregatedItems,
      filters: { customerId }
    });

    const pdfBuffer = await PdfGenerator.generatePdf(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="balances_clientes.pdf"');

    return new NextResponse(pdfBuffer as any, { status: 200, headers });

  } catch (error: any) {
    console.error('Error generating Customer Balances report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
