import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { ArRepository } from '@/repositories/arRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings, customers } from '@/db';
import { eq } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { id: receiptId } = await params;
    const receipt = await ArRepository.getReceiptDetails(session.companyId, receiptId);

    if (!receipt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Recibo de ingreso no encontrado' } },
        { status: 404 }
      );
    }

    // Fetch company and settings
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

    // Fetch customer details if they exist
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, receipt.customerId))
      .limit(1);

    const receiptRecord = {
      id: receipt.id,
      date: receipt.date,
      paymentMethod: receipt.paymentMethod,
      amount: receipt.amount,
      reference: receipt.reference,
      notes: receipt.notes,
      appliedInvoices: receipt.appliedInvoices,
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.businessActivity || 'República Dominicana',
        phone: '1-809-555-0199', // Placeholder
        logoUrl: settings?.logoUrl || undefined,
        settings: { 
          printLayout: settings?.printLayout || 'carta' 
        }
      },
      customer: customer ? {
        name: customer.name,
        rncCedula: customer.rncCedula,
        address: customer.address
      } : {
        name: 'Cliente General',
        rncCedula: '',
        address: ''
      }
    };

    // Render HTML and convert to PDF
    const layout = receiptRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
    const html = DocumentTemplates.renderReceipt(receiptRecord, layout);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

    // Save temporary document
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // Generate signed URL
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10); // 10 minute expiration

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
  } catch (error: any) {
    console.error('Error generating receipt print:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
