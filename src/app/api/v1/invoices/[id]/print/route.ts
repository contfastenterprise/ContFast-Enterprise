import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
// Import dependencies para base de datos (simulado aquí para el ejemplo de impresión)
// import { db } from '@/db';
// import { invoices, companies, customers, invoiceLines, invoiceTaxes } from '@/db/schema';
// import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Aquí validamos autenticación y permisos
    // const session = await getServerSession();
    // if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: invoiceId } = await params;

    // 2. Fetch invoice and related data from DB
    /* 
    const invoiceRecord = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        company: { with: { settings: true } },
        customer: true,
        lines: true,
        taxes: true
      }
    });
    */
    
    // Datos simulados para demostrar la funcionalidad
    const invoiceRecord = {
      ncf: 'E310000000001',
      createdAt: new Date().toISOString(),
      paymentStatus: 'paid',
      subtotal: 1000,
      discount: 0,
      total: 1180,
      lines: [
        { quantity: 2, productName: 'Servicio Contable', unitPrice: 500, discount: 0, total: 1000 }
      ],
      taxes: [
        { taxType: 'ITBIS', rate: 18, amount: 180 }
      ],
      company: {
        name: 'ContFast SRL',
        rnc: '130123456',
        address: 'Av. Winston Churchill',
        phone: '809-555-5555',
        settings: { printLayout: 'carta' }
      },
      customer: {
        name: 'Cliente Final',
        rncCedula: '00112345678'
      }
    };

    if (!invoiceRecord) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 3. Generar base64 QR si aplica
    // La DGII requiere una URL específica con el eNCF codificado
    const dgiiUrl = `https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=${invoiceRecord.company.rnc}&rncComprador=${invoiceRecord.customer?.rncCedula}&eNCF=${invoiceRecord.ncf}`;
    const qrBase64 = await PdfGenerator.generateQrBase64(dgiiUrl);

    // 4. Renderizar HTML según el layout
    const layout = invoiceRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
    const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);

    // 5. Convertir HTML a PDF en memoria
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

    // 6. Almacenar el archivo temporalmente
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // 7. Generar URL firmada
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10); // Expiración 10 minutos

    return NextResponse.json({
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

  } catch (error) {
    console.error('Error printing invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
