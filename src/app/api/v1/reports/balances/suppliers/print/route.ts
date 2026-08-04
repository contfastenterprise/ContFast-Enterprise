import { NextRequest, NextResponse } from 'next/server';
import { db, accountsPayable, suppliers, companies } from '@/db';
import { eq, and, isNull, gt } from 'drizzle-orm';
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
      eq(accountsPayable.companyId, companyId),
      eq(accountsPayable.modo, modo),
      isNull(accountsPayable.deletedAt),
      gt(accountsPayable.balance, '0')
    );

    if (supplierId && supplierId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsPayable.supplierId, supplierId));
    }

    // 3. Fetch Items
    const items = await db
      .select({
        balance: accountsPayable.balance,
        dueDate: accountsPayable.dueDate,
        supplierId: accountsPayable.supplierId,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
      })
      .from(accountsPayable)
      .leftJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .where(queryConditions);

    // 4. Aggregate
    const grouped: Record<string, any> = {};
    const now = new Date();
    
    items.forEach(item => {
      const sid = item.supplierId || 'unknown';
      if (!grouped[sid]) {
        grouped[sid] = {
          supplierId: sid,
          supplierName: item.supplierName || 'Desconocido',
          supplierRnc: item.supplierRnc || 'N/A',
          totalBalance: 0,
          overdueBalance: 0,
          overdue1to30: 0,
          overdue31to60: 0,
          overdue61Plus: 0,
        };
      }
      
      const bal = Number(item.balance);
      grouped[sid].totalBalance += bal;
      
      const dueDate = new Date(item.dueDate);
      const diffTime = now.getTime() - dueDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        grouped[sid].overdueBalance += bal;
        if (diffDays <= 30) {
          grouped[sid].overdue1to30 += bal;
        } else if (diffDays <= 60) {
          grouped[sid].overdue31to60 += bal;
        } else {
          grouped[sid].overdue61Plus += bal;
        }
      }
    });

    const aggregatedItems = Object.values(grouped);

    // 5. Generate HTML and PDF
    const html = DocumentTemplates.renderSupplierBalancesReport({
      company,
      items: aggregatedItems,
      filters: { supplierId }
    });

    const pdfBuffer = await PdfGenerator.generatePdf(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="balances_suplidores.pdf"');

    return new NextResponse(pdfBuffer as any, { status: 200, headers });

  } catch (error: any) {
    console.error('Error generating Supplier Balances report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
