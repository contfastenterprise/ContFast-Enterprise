import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { QuoteService } from '@/services/quoteService';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';

async function getQuotePdfBuffer(quoteId: string, companyId: string) {
  const quote = await QuoteService.getQuote(quoteId);
  if (!quote || quote.companyId !== companyId) {
    throw new Error('Cotización no encontrada');
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

  if (!company) {
    throw new Error('Perfil de empresa no encontrado');
  }

  const fullCompany = {
    ...company,
    logoUrl: settings?.logoUrl || (company as any).logoUrl || undefined,
    phone: company.phone || '',
    email: company.email || settings?.msellerEmail || '',
    address: company.address || '',
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

  return { pdfBuffer, filename };
}

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
    const { pdfBuffer, filename } = await getQuotePdfBuffer(quoteId, session.companyId);

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error printing quote GET:', error);
    return new NextResponse(`Error al generar impresión de cotización: ${error.message}`, {
      status: error.message === 'Cotización no encontrada' ? 404 : 500
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const { pdfBuffer } = await getQuotePdfBuffer(quoteId, session.companyId);

    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10);

    return NextResponse.json({
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }, { headers: resHeaders });

  } catch (error: any) {
    console.error('Error printing quote POST:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
