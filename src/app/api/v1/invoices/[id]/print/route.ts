import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, invoices, companies, companySettings, customers, invoiceLines, invoiceTaxes, products } from '@/db';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;

    // 1. Fetch invoice from DB
    const [invoiceRecordDb] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoiceRecordDb) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 2. Fetch company and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, invoiceRecordDb.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, invoiceRecordDb.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: 'Company profile not found' }, { status: 404 });
    }

    // 3. Fetch customer details if they exist
    let customer = null;
    if (invoiceRecordDb.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, invoiceRecordDb.customerId))
        .limit(1);
      customer = cust;
    }

    // 4. Fetch lines and join with product name
    const lines = await db
      .select({
        quantity: invoiceLines.quantity,
        unitPrice: invoiceLines.unitPrice,
        discount: invoiceLines.discount,
        total: invoiceLines.total,
        productName: products.name,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    // 5. Fetch taxes
    const taxes = await db
      .select()
      .from(invoiceTaxes)
      .where(eq(invoiceTaxes.invoiceId, invoiceId));

    const invoiceRecord = {
      ncf: invoiceRecordDb.ncf,
      createdAt: invoiceRecordDb.createdAt.toISOString(),
      paymentStatus: invoiceRecordDb.paymentStatus,
      subtotal: Number(invoiceRecordDb.subtotal),
      discount: Number(invoiceRecordDb.discount),
      total: Number(invoiceRecordDb.total),
      lines: lines.map(l => ({
        quantity: Number(l.quantity),
        productName: l.productName || 'Producto/Servicio',
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        total: Number(l.total)
      })),
      taxes: taxes.map(t => ({
        taxType: t.taxType,
        rate: Number(t.rate),
        amount: Number(t.amount)
      })),
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.businessActivity || 'Santiago, R.D.',
        phone: '1-829-214-4128', // Latin Doors phone from the template
        logoUrl: settings?.logoUrl || undefined,
        settings: { 
          printLayout: settings?.printLayout || 'carta' 
        }
      },
      customer: customer ? {
        name: customer.name,
        rncCedula: customer.rncCedula
      } : {
        name: invoiceRecordDb.buyerName || 'Consumidor Final',
        rncCedula: invoiceRecordDb.buyerRnc || ''
      }
    };

    // 3. Generar base64 QR
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

  } catch (error: any) {
    console.error('Error printing invoice:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
