import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { QuoteService } from '@/services/quoteService';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);

    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { id: quoteId } = await params;
    const quote = await QuoteService.getQuote(quoteId);

    if (!quote || quote.companyId !== session.companyId) {
      return new NextResponse('Cotización no encontrada', { status: 404 });
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, quote.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, quote.companyId))
      .limit(1);

    const fullCompany = {
      ...company,
      settings
    };

    const html = DocumentTemplates.renderQuote({
      company: fullCompany,
      customer: quote.customer,
      quote,
      lines: quote.lines,
      taxes: quote.taxes,
    });

    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');
    const filename = `Cotizacion_${quote.sequenceNumber || quoteId.substring(0, 8)}.pdf`;

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating quote PDF GET:', error);
    return new NextResponse(`Error al generar PDF de cotización: ${error.message}`, {
      status: 500
    });
  }
}
