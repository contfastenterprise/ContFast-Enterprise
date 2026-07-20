import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings, suppliers, accountsPayable, expenses } from '@/db';
import { eq, and, isNull, sql, or } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'proveedores', 'read');

    const body = await req.json();
    const { supplierId } = body;

    if (!supplierId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID del proveedor es requerido' } }, { status: 400 });
    }

    // Fetch supplier details
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (!supplier) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proveedor no encontrado' } }, { status: 404 });
    }

    // Fetch company profile and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, session.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Perfil de compañía no encontrado' } }, { status: 404 });
    }

    // Fetch all pending bills for this supplier with computed true original amount, ncf, and issueDate
    const pendingBills = await db
      .select({
        ap: accountsPayable,
        ncf: sql<string>`(SELECT ncf FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
        issueDate: sql<string>`(SELECT issue_date FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
        checkDueDate: sql<string>`(SELECT due_date FROM checks WHERE checks.ap_id = accounts_payable.id AND checks.is_guarantee = true AND checks.status = 'pending' LIMIT 1)`,
        paymentsSum: sql<string>`COALESCE((SELECT SUM(amount) FROM ap_payments WHERE ap_payments.ap_id = accounts_payable.id AND ap_payments.status = 'applied'), '0.00')`
      })
      .from(accountsPayable)
      .where(and(
        eq(accountsPayable.companyId, session.companyId),
        eq(accountsPayable.supplierId, supplierId),
        isNull(accountsPayable.deletedAt)
      ))
      .orderBy(accountsPayable.dueDate);

    // Format utility
    const formatDbDateString = (date: Date | string | null | undefined): string | null => {
      if (!date) return null;
      const d = typeof date === 'string' ? new Date(date) : date;
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Filter to non-paid bills and map
    const filteredBills = pendingBills
      .filter(row => parseFloat(row.ap.balance) > 0.01)
      .map(row => {
        const balanceNum = parseFloat(row.ap.balance);
        const paymentsVal = parseFloat(row.paymentsSum);
        const computedOriginalAmount = balanceNum + paymentsVal;

        return {
          apId: row.ap.id,
          amount: computedOriginalAmount,
          balance: balanceNum,
          dueDate: formatDbDateString(row.checkDueDate || row.ap.dueDate),
          issueDate: formatDbDateString(row.issueDate),
          ncf: row.ncf || 'S/N',
          status: row.ap.status
        };
      });

    const totalBalance = filteredBills.reduce((sum, bill) => sum + bill.balance, 0);

    const reportData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || 'República Dominicana',
        phone: '1-809-555-0199', // Placeholder
        logoUrl: settings?.logoUrl || undefined
      },
      supplier: {
        name: supplier.name,
        rnc: supplier.rnc,
        address: supplier.address || ''
      },
      items: filteredBills,
      totalBalance
    };

    // Render HTML and generate PDF
    const html = DocumentTemplates.renderSupplierAPStatement(reportData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    // Save temporary document
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    const supplierName = supplier.name || 'Proveedor';
    const reason = 'Estado de Cuenta';
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;

    const cleanSupplierName = supplierName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const finalFilename = `${cleanSupplierName} - ${reason} - ${printDate}.pdf`;

    // Generate signed URL
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10, finalFilename); // 10 minutes

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
  } catch (error: any) {
    console.error('Error generating supplier AP PDF:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
