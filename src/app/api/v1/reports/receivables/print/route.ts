import { NextRequest, NextResponse } from 'next/server';
import { db, accountsReceivable, customers, invoices, companies } from '@/db';
import { eq, and, isNull, desc, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { PdfGenerator } from '@/services/print/pdfGenerator';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { companyId, modo } = auth;

    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId');

    // 1. Fetch Company Info
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    
    // 2. Query conditions
    let queryConditions = and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      isNull(accountsReceivable.deletedAt),
      gt(accountsReceivable.balance, '0')
    );

    let customerFilterName = 'Todos los clientes';
    if (customerId && customerId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsReceivable.customerId, customerId));
      const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (cust) customerFilterName = cust.name;
    }

    // 3. Fetch Items
    const items = await db
      .select({
        id: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        ncf: invoices.ncf,
        codigoFactura: invoices.codigoFactura,
        amount: accountsReceivable.amount,
        balance: accountsReceivable.balance,
        dueDate: accountsReceivable.dueDate,
        status: accountsReceivable.status,
        customerId: accountsReceivable.customerId,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
        createdAt: accountsReceivable.createdAt,
      })
      .from(accountsReceivable)
      .leftJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .leftJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(queryConditions)
      .orderBy(desc(accountsReceivable.dueDate));

    const totalBalance = items.reduce((acc, curr) => acc + Number(curr.balance), 0);
    const overdueBalance = items.filter(d => new Date(d.dueDate) < new Date()).reduce((acc, curr) => acc + Number(curr.balance), 0);

    const reportData = {
      company,
      items,
      filters: {
        customerName: customerFilterName,
        date: new Date().toLocaleDateString('es-DO')
      },
      totals: {
        balance: totalBalance,
        overdue: overdueBalance
      }
    };

    // 4. Generate HTML and PDF
    const html = DocumentTemplates.renderReceivablesReport(reportData);
    const pdfBuffer = await PdfGenerator.generatePdf(html, 'carta');

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="reporte_cuentas_por_cobrar.pdf"',
      }
    });

  } catch (error: any) {
    console.error('Error printing receivables report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
