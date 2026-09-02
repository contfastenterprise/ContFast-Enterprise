import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { FinancialRepository } from '@/repositories/financialRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';

import { and, sql } from 'drizzle-orm';
import { expenses, accountsPayable } from '@/db/schema';

function checkFinancialAccess(roleName: string): boolean {
  const role = roleName.toLowerCase();
  return role.includes('sistema') || role.includes('admin') || role.includes('administraci') || role === 'contabilidad';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'contabilidad', 'read');
    if (denegado) return denegado;

    // Role verification
    if (!checkFinancialAccess(session.role)) {
      return NextResponse.json({ 
        success: false, 
        error: { 
          code: 'FORBIDDEN', 
          message: 'No tiene permisos para acceder al módulo financiero de estados de cuenta.' 
        } 
      }, { status: 403 });
    }

    const { id: supplierId } = await params;
    if (!supplierId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID de suplidor es requerido' } }, { status: 400 });
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

    const body = await req.json();
    const { startDate, endDate, type, search, printScope = 'all' } = body;

    // Fetch detailed statement data
    const statementData = await FinancialRepository.getSupplierStatement(session.companyId, session.modo, supplierId, {
      startDate,
      endDate,
      type,
      search
    });

    let movements = statementData.movements;

    if (printScope === 'pending' || printScope === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      const pendingExpenses = await db
        .select({
          ncf: expenses.ncf,
          dueDate: accountsPayable.dueDate
        })
        .from(expenses)
        .innerJoin(
          accountsPayable,
          and(
            eq(expenses.supplierId, accountsPayable.supplierId),
            eq(expenses.amount, accountsPayable.amount),
            eq(accountsPayable.status, 'pending')
          )
        )
        .where(
          and(
            eq(expenses.companyId, session.companyId),
            eq(expenses.modo, session.modo),
            eq(expenses.supplierId, supplierId),
            eq(expenses.paymentMethod, '04'), // credit
            sql`expenses.deleted_at IS NULL`,
            sql`accounts_payable.deleted_at IS NULL`
          )
        );

      if (printScope === 'pending') {
        const pendingNcfs = new Set(pendingExpenses.map(e => e.ncf).filter(Boolean));
        movements = movements.filter((m: any) => pendingNcfs.has(m.documentNumber));
      } else if (printScope === 'overdue') {
        const overdueNcfs = new Set(
          pendingExpenses
            .filter(e => e.dueDate < today)
            .map(e => e.ncf)
            .filter(Boolean)
        );
        movements = movements.filter((m: any) => overdueNcfs.has(m.documentNumber));
      }
    }

    const reportData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        // Auditoria ISO-17: el telefono es el de la empresa, o ninguno.
        address: company.address || '',
        phone: company.phone || '',
        logoUrl: settings?.logoUrl || undefined
      },
      supplier: {
        name: statementData.supplier.name,
        rnc: statementData.supplier.rnc || '',
        address: statementData.supplier.address || ''
      },
      movements,
      summary: statementData.summary
    };

    // Render HTML and generate PDF
    const html = DocumentTemplates.renderSupplierFinancialStatement(reportData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    // Save temporary document
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // Generate signed URL
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10); // 10 minutes

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
  } catch (error: any) {
    console.error('Error generating supplier statement PDF:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
