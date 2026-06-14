import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions, ecfSequences } from '@/db';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'cf_v2_jwt_access_secret_2026_super_secure_9876543210';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    let companyId: string | null = null;
    const resHeaders = new Headers();

    // 1. Authenticate either via JWT token parameter or session cookies
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded.invoiceId !== id) {
          return new NextResponse('Token de descarga inválido.', { status: 400 });
        }
        companyId = decoded.companyId;
      } catch (err: any) {
        return new NextResponse(`Token de descarga expirado o inválido: ${err.message}`, { status: 401 });
      }
    } else {
      // Normal authenticated request using session cookies (direct browser navigation)
      const auth = await verifyAuth(req, resHeaders);
      if (!auth) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
          { status: 401 }
        );
      }
      // Enforce read permission
      try {
        await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');
        companyId = auth.companyId;
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: err.message } },
          { status: 403, headers: resHeaders }
        );
      }
    }

    if (!companyId) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const invoice = await InvoiceRepository.getById(id, companyId);
    if (!invoice) {
      return new NextResponse('Factura no encontrada.', { status: 404 });
    }

    // Fetch company and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, invoice.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, invoice.companyId))
      .limit(1);

    // Fetch NCF sequence details to get the expiration date
    const [sequence] = await db
      .select({
        expiryDate: ecfSequences.expiryDate,
        sequenceExpiry: ecfSequences.sequenceExpiry,
      })
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, invoice.companyId),
          eq(ecfSequences.ecfType, invoice.ecfType)
        )
      )
      .limit(1);

    const ncfExpiry = sequence?.sequenceExpiry || (sequence?.expiryDate ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : '31-12-2027');

    if (!company) {
      return new NextResponse('Company profile not found', { status: 404 });
    }

    // Fetch customer details if they exist
    let customer = null;
    if (invoice.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, invoice.customerId))
        .limit(1);
      customer = cust;
    }

    // Fetch lines and join with product details
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
      .where(eq(invoiceLines.invoiceId, id));

    // Fetch taxes
    const taxes = await db
      .select()
      .from(invoiceTaxes)
      .where(eq(invoiceTaxes.invoiceId, id));

    // Fetch dgii submission to retrieve security code and QR code from mseller
    const [submission] = await db
      .select()
      .from(dgiiSubmissions)
      .where(eq(dgiiSubmissions.invoiceId, id))
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
      securityCode = crypto.createHash('sha256').update(invoice.id + invoice.ncf).digest('hex').substring(0, 16).toUpperCase();
    }

    if (!qrBase64) {
      const dateFormatted = new Date(invoice.createdAt).toLocaleDateString('es-DO').replace(/\//g, '-');
      const dgiiUrl = `https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=${company.rnc}&rncComprador=${invoice.buyerRnc || ''}&eNCF=${invoice.ncf}&fechaFirma=${dateFormatted}&montoTotal=${Number(invoice.total).toFixed(2)}&codigoSeguridad=${securityCode}`;
      qrBase64 = await PdfGenerator.generateQrBase64(dgiiUrl);
    }

    const invoiceRecord = {
      ncf: invoice.ncf,
      ecfType: invoice.ecfType,
      paymentType: invoice.paymentType,
      createdAt: invoice.createdAt.toISOString(),
      paymentStatus: invoice.paymentStatus,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      totalTaxes: Number(invoice.totalTaxes),
      total: Number(invoice.total),
      notes: invoice.notes || '',
      securityCode,
      signatureDate: signedDate || invoice.createdAt.toISOString(),
      ncfExpiryDate: ncfExpiry,
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
        name: invoice.buyerName || 'Consumidor Final',
        rncCedula: invoice.buyerRnc || '',
        phone: '',
        address: ''
      }
    };

    // Render HTML and convert to PDF dynamically
    const layout = invoiceRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
    const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${invoice.ncf}.pdf"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers
    });
  } catch (error: any) {
    console.error('Error in PDF download direct stream:', error);
    return new NextResponse(`Error interno al generar PDF: ${error.message}`, { status: 500 });
  }
}
