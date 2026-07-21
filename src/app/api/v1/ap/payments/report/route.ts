import { NextRequest, NextResponse } from 'next/server';
import { db, companies, companySettings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { ApRepository } from '@/repositories/apRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    // Fetch payments list via repository (limit to 1000 items)
    const { items } = await ApRepository.getPayments(session.companyId, {
      startDate,
      endDate,
      limit: 1000
    });

    // Filter to guarantee checks
    const guaranteeChecks = items.filter(p => p.checkStatus !== null && p.checkStatus !== undefined);
    const pendingChecks = guaranteeChecks.filter(p => p.status === 'pending_guarantee');
    const appliedChecks = guaranteeChecks.filter(p => p.status === 'applied');

    // Fetch company info
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
      return new NextResponse('Perfil de compañía no encontrado.', { status: 404 });
    }

    const docData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: '1-809-555-0199',
        logoUrl: settings?.logoUrl || undefined,
      },
      pendingChecks,
      appliedChecks,
      filters: {
        startDate: startDate || 'Inicio',
        endDate: endDate || 'Hoy',
      }
    };

    const html = DocumentTemplates.renderGuaranteeChecksReport(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="reporte_cheques_garantia.pdf"');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating guarantee checks report PDF:', error);
    return new NextResponse(`Error al generar reporte: ${error.message}`, {
      status: 500
    });
  }
}
