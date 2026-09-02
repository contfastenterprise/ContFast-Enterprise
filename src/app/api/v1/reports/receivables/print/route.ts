import { NextRequest, NextResponse } from 'next/server';
import { db, accountsReceivable, customers, invoices, companies, companySettings } from '@/db';
import { eq, and, isNull, desc, gt } from 'drizzle-orm';
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
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    
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
      // Aislamiento multiempresa (auditoria F0-06).
      const [cust] = await db.select().from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId))).limit(1);
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
      company: {
        ...company,
        logoUrl: settings?.logoUrl || null
      },
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
