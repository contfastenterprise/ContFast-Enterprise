import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { ArRepository } from '@/repositories/arRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, companies, companySettings, customers } from '@/db';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'cobros', 'read');

    const body = await req.json();
    const { customerId, search } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID de cliente es requerido' } }, { status: 400 });
    }

    // Fetch customer details
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } }, { status: 404 });
    }

    // Fetch company profile and settings
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

    // Get receipts breakdown
    const statementItems = await ArRepository.getCustomerReceiptsBreakdown(session.companyId, customerId);

    // Filter statement items if search query is provided
    let filteredItems = statementItems;
    if (search) {
      const q = search.toLowerCase();
      filteredItems = statementItems.filter(item => 
        item.codigoFactura?.toLowerCase().includes(q) ||
        item.invoiceNumber?.toLowerCase().includes(q) ||
        `rec-${item.receiptId.slice(0, 8).toUpperCase()}`.toLowerCase().includes(q) ||
        item.reference?.toLowerCase().includes(q) ||
        item.receiptDate.includes(q)
      );
    }

    // Calculate progressive remaining balance chronologically ascending (oldest first)
    const groupedByInvoice: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      const invId = item.invoiceId;
      if (!groupedByInvoice[invId]) {
        groupedByInvoice[invId] = [];
      }
      groupedByInvoice[invId].push(item);
    });

    const processedItems: any[] = [];
    Object.values(groupedByInvoice).forEach(group => {
      const sorted = [...group].sort((a, b) => {
        const dateA = new Date(a.receiptDate).getTime();
        const dateB = new Date(b.receiptDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      let runningBalance = sorted[0].invoiceTotal;
      const computedGroup = sorted.map(item => {
        runningBalance -= item.amountApplied;
        return {
          ...item,
          progressiveBalance: Math.max(0, runningBalance)
        };
      });
      processedItems.push(...computedGroup);
    });

    // Sort final list by date descending (newest first)
    const sortedFinal = processedItems.sort((a, b) => {
      const dateA = new Date(a.receiptDate).getTime();
      const dateB = new Date(b.receiptDate).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const reportData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || 'República Dominicana',
        phone: '1-809-555-0199', // Placeholder
        logoUrl: settings?.logoUrl || undefined
      },
      customer: {
        name: customer.name,
        rncCedula: customer.rncCedula || '',
        address: customer.address || ''
      },
      items: sortedFinal
    };

    // Render HTML and generate PDF
    const html = DocumentTemplates.renderCustomerStatement(reportData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    // Save temporary document
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    const customerName = customer.name || 'Cliente';
    const reason = 'Estado de Cuenta';
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;

    const cleanCustomerName = customerName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const finalFilename = `${cleanCustomerName} - ${reason} - ${printDate}.pdf`;

    // Generate signed URL
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10, finalFilename); // 10 minutes

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
  } catch (error: any) {
    console.error('Error generating statement PDF:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
