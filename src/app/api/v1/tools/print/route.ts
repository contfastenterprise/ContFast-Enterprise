import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/pdfGenerator';
import { PdfGenerator as PuppeteerPdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data, sheetWidth, sheetHeight } = body;

    if (!type || !data) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (type, data)' }, { status: 400 });
    }

    // Get the first company from the database
    const [company] = await db.select().from(companies).limit(1);
    if (!company) {
      return NextResponse.json({ error: 'Perfil de empresa no configurado' }, { status: 404 });
    }

    // Get settings to retrieve msellerEmail or logoUrl if available
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.companyId, company.id)).limit(1);

    const companyInfo = {
      name: company.name,
      rnc: company.rnc,
      address: company.address || 'Santiago, R.D.',
      phone: '1-829-214-4128', // Latin Doors phone
      email: settings?.msellerEmail || 'latindoors@gmail.com',
      logoUrl: settings?.logoUrl || undefined,
    };

    let pdfBuffer: Buffer;
    if (type === 'desglose') {
      const html = DocumentTemplates.renderWindowBreakdown({ company: companyInfo, items: data });
      pdfBuffer = await PuppeteerPdfGenerator.generatePdfFromHtml(html, 'carta', true);
    } else if (type === 'corte') {
      const sw = Number(sheetWidth) || 96;
      const sh = Number(sheetHeight) || 72;
      pdfBuffer = await PdfGenerator.generateGlassCutting(companyInfo, data, sw, sh);
    } else {
      return NextResponse.json({ error: 'Tipo de reporte no soportado' }, { status: 400 });
    }

    // Store the generated file in temporary memory using current system structure
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // Generate signed URL valid for 10 minutes
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10);

    return NextResponse.json({
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

  } catch (error: any) {
    console.error('Error generating tool print PDF:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
