import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, invoices, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions } from '@/db';
import { eq } from 'drizzle-orm';

async function getInvoicePdfBuffer(invoiceId: string) {
  // 1. Fetch invoice from DB
  const [invoiceRecordDb] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoiceRecordDb) {
    throw new Error('Invoice not found');
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
    throw new Error('Company profile not found');
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

  // 4. Fetch lines and join with product details
  const lines = await db
    .select({
      quantity: invoiceLines.quantity,
      unitPrice: invoiceLines.unitPrice,
      discount: invoiceLines.discount,
      total: invoiceLines.total,
      productName: products.name,
      productSku: products.sku,
      unitOfMeasure: products.unitOfMeasure,
    })
    .from(invoiceLines)
    .leftJoin(products, eq(invoiceLines.productId, products.id))
    .where(eq(invoiceLines.invoiceId, invoiceId));

  // 5. Fetch taxes
  const taxes = await db
    .select()
    .from(invoiceTaxes)
    .where(eq(invoiceTaxes.invoiceId, invoiceId));

  // Fetch dgii submission to retrieve security code and QR code from mseller
  const [submission] = await db
    .select()
    .from(dgiiSubmissions)
    .where(eq(dgiiSubmissions.invoiceId, invoiceId))
    .limit(1);

  let securityCode = '';
  let qrBase64 = '';
  let signedDate = '';

  if (submission && submission.responsePayload) {
    try {
      const payload = JSON.parse(submission.responsePayload);
      securityCode = payload.securityCode || payload.codigoSeguridad || '';
      const rawQr = payload.qr_url || payload.qrCode || '';
      if (rawQr) {
        if (rawQr.startsWith('http')) {
          qrBase64 = await PdfGenerator.generateQrBase64(rawQr);
        } else {
          qrBase64 = rawQr;
        }
      }
      signedDate = payload.signedDate || payload.fechaFirma || payload.FechaFirma || '';
    } catch (err) {
      console.error('Error parsing submission responsePayload:', err);
    }
  }

  // Fallbacks if not processed by worker yet (or if worker response didn't contain them)
  const crypto = require('crypto');
  if (!securityCode) {
    securityCode = crypto.createHash('sha256').update(invoiceRecordDb.id + invoiceRecordDb.ncf).digest('hex').substring(0, 16).toUpperCase();
  }

  if (!qrBase64) {
    const dateFormatted = new Date(invoiceRecordDb.createdAt).toLocaleDateString('es-DO').replace(/\//g, '-');
    const dgiiUrl = `https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=${company.rnc}&rncComprador=${invoiceRecordDb.buyerRnc || ''}&eNCF=${invoiceRecordDb.ncf}&fechaFirma=${dateFormatted}&montoTotal=${Number(invoiceRecordDb.total).toFixed(2)}&codigoSeguridad=${securityCode}`;
    qrBase64 = await PdfGenerator.generateQrBase64(dgiiUrl);
  }

  const invoiceRecord = {
    ncf: invoiceRecordDb.ncf,
    ecfType: invoiceRecordDb.ecfType,
    paymentType: invoiceRecordDb.paymentType,
    createdAt: invoiceRecordDb.createdAt.toISOString(),
    paymentStatus: invoiceRecordDb.paymentStatus,
    subtotal: Number(invoiceRecordDb.subtotal),
    discount: Number(invoiceRecordDb.discount),
    totalTaxes: Number(invoiceRecordDb.totalTaxes),
    total: Number(invoiceRecordDb.total),
    notes: invoiceRecordDb.notes || '',
    securityCode,
    signatureDate: signedDate || invoiceRecordDb.createdAt.toISOString(),
    lines: lines.map(l => ({
      quantity: Number(l.quantity),
      productName: l.productName || 'Producto/Servicio',
      productSku: l.productSku || 'N/A',
      unitOfMeasure: l.unitOfMeasure || 'Unidad',
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
      address: company.address || 'Santiago, R.D.',
      phone: '1-829-214-4128', // Latin Doors phone from the template
      email: settings?.msellerEmail || 'latindoors@gmail.com',
      logoUrl: settings?.logoUrl || undefined,
      settings: { 
        printLayout: settings?.printLayout || 'carta' 
      }
    },
    customer: customer ? {
      name: customer.name,
      rncCedula: customer.rncCedula,
      phone: customer.phone || '',
      address: customer.address || ''
    } : {
      name: invoiceRecordDb.buyerName || 'Consumidor Final',
      rncCedula: invoiceRecordDb.buyerRnc || '',
      phone: '',
      address: ''
    }
  };

  // 4. Renderizar HTML según el layout
  const layout = invoiceRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
  const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);

  // 5. Convertir HTML a PDF en memoria
  const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

  return {
    pdfBuffer,
    filename: `invoice_${invoiceRecord.ncf || invoiceId}.pdf`
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const { pdfBuffer, filename } = await getInvoicePdfBuffer(invoiceId);

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error printing invoice GET:', error);
    return new NextResponse(`Error al generar vista de impresión: ${error.message}`, {
      status: error.message === 'Invoice not found' ? 404 : 500
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const { pdfBuffer } = await getInvoicePdfBuffer(invoiceId);

    // 6. Almacenar el archivo temporalmente
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // 7. Generar URL firmada
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10); // Expiración 10 minutos

    return NextResponse.json({
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

  } catch (error: any) {
    console.error('Error printing invoice POST:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
