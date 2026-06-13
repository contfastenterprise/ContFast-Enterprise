import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, invoices, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions } from '@/db';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'cf_v2_jwt_access_secret_2026_super_secure_9876543210';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  // --- CASE 1: Client has a query token. Verify it and stream the PDF ---
  if (token) {
    try {
      // Verify token authenticity and check that it's for this specific invoice
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.invoiceId !== id) {
        return new NextResponse('Token de descarga inválido.', { status: 400 });
      }

      const invoice = await InvoiceRepository.getById(id, decoded.companyId);
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

      if (submission && submission.responsePayload) {
        try {
          const payload = JSON.parse(submission.responsePayload);
          securityCode = payload.securityCode || '';
          qrBase64 = payload.qrCode || ''; // mseller returns base64 image or url
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
        securityCode,
        signatureDate: invoice.createdAt.toISOString(),
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
          address: company.businessActivity || 'Santiago, R.D.',
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

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${invoice.ncf}.pdf"`,
        },
      });
    } catch (err: any) {
      return new NextResponse(`Token de descarga expirado o inválido: ${err.message}`, { status: 401 });
    }
  }

  // --- CASE 2: Normal authenticated request. Generate a short-lived download token ---
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const invoice = await InvoiceRepository.getById(id, auth.companyId);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Generate a secure, short-lived JWT token (expires in 5 minutes)
    const downloadToken = jwt.sign(
      { invoiceId: id, companyId: auth.companyId },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    const signedUrl = `/api/v1/invoices/${id}/pdf?token=${downloadToken}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          url: signedUrl,
          expires_in_seconds: 300,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in generating PDF signed URL:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
