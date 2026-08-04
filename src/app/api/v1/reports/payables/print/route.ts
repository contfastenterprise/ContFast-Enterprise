import { NextRequest, NextResponse } from 'next/server';
import { db, accountsPayable, suppliers, companies } from '@/db';
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
    const supplierId = url.searchParams.get('supplierId');

    // 1. Fetch Company Info
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    
    // 2. Query conditions
    let queryConditions = and(
      eq(accountsPayable.companyId, companyId),
      eq(accountsPayable.modo, modo),
      isNull(accountsPayable.deletedAt),
      gt(accountsPayable.balance, '0')
    );

    let supplierFilterName = 'Todos los proveedores';
    if (supplierId && supplierId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsPayable.supplierId, supplierId));
      const [supp] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
      if (supp) supplierFilterName = supp.name;
    }

    // 3. Fetch Items
    const items = await db
      .select({
        apId: accountsPayable.id,
        amount: accountsPayable.amount,
        balance: accountsPayable.balance,
        dueDate: accountsPayable.dueDate,
        status: accountsPayable.status,
        supplierId: accountsPayable.supplierId,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        createdAt: accountsPayable.createdAt,
      })
      .from(accountsPayable)
      .leftJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .where(queryConditions)
      .orderBy(desc(accountsPayable.dueDate));

    const totalBalance = items.reduce((acc, curr) => acc + Number(curr.balance), 0);
    const overdueBalance = items.filter(d => new Date(d.dueDate) < new Date()).reduce((acc, curr) => acc + Number(curr.balance), 0);

    const reportData = {
      company,
      items,
      filters: {
        supplierName: supplierFilterName,
        date: new Date().toLocaleDateString('es-DO')
      },
      totals: {
        balance: totalBalance,
        overdue: overdueBalance
      }
    };

    // 4. Generate HTML and PDF
    const html = DocumentTemplates.renderPayablesReport(reportData);
    const pdfBuffer = await PdfGenerator.generatePdf(html, 'carta');

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="reporte_cuentas_por_pagar.pdf"',
      }
    });

  } catch (error: any) {
    console.error('Error printing payables report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
