import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { FinancialRepository } from '@/repositories/financialRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';

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
    const { startDate, endDate, type, search } = body;

    // Fetch detailed statement data
    const statementData = await FinancialRepository.getSupplierStatement(session.companyId, supplierId, {
      startDate,
      endDate,
      type,
      search
    });

    const reportData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || 'República Dominicana',
        phone: '1-809-555-0199',
        logoUrl: settings?.logoUrl || undefined
      },
      supplier: {
        name: statementData.supplier.name,
        rnc: statementData.supplier.rnc || '',
        address: statementData.supplier.address || ''
      },
      movements: statementData.movements,
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
