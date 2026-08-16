import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invoices } from '@/db/schema/invoices';
import { companies } from '@/db/schema/companies';
import { customers } from '@/db/schema/contacts';
import { eq } from 'drizzle-orm';
import { DocumentService } from '@/services/documents/documentService';
import { InvoiceTemplate } from '@/components/documents/templates/InvoiceTemplate';
// Ideally you would have an Auth check here using your standard auth provider (e.g. Supabase Auth)
// import { createClient } from '@/utils/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const { type, id } = params;
    
    // TODO: Verify user authentication and extract companyId from session
    // const supabase = createClient();
    // const { data: { session } } = await supabase.auth.getSession();
    // if (!session) return new NextResponse('Unauthorized', { status: 401 });

    // Since this is a demo/implementation, we assume the invoice exists and we fetch it directly
    if (type !== 'invoice') {
      return new NextResponse('Unsupported document type', { status: 400 });
    }

    const invoiceData = await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
      with: {
        company: true,
        customer: true,
        lines: true,
        taxes: true,
      }
    });

    if (!invoiceData) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // TODO: Verify invoiceData.companyId === session.user.companyId

    const templateData = {
      company: {
        id: invoiceData.company.id,
        name: invoiceData.company.name,
        rnc: invoiceData.company.rnc || undefined,
        logoUrl: invoiceData.company.logoUrl || undefined,
        phone: invoiceData.company.phone || undefined,
        email: invoiceData.company.email || undefined,
        address: invoiceData.company.address || undefined,
      },
      customer: {
        name: invoiceData.customer?.name || 'Cliente Genérico',
        rnc: invoiceData.customer?.rnc || undefined,
      },
      invoice: {
        number: invoiceData.codigoFactura || invoiceData.ncf || 'DRAFT',
        ncf: invoiceData.ncf,
        date: new Date(invoiceData.createdAt).toLocaleDateString('es-DO'),
        status: invoiceData.status,
        paymentType: invoiceData.paymentType,
        subtotal: Number(invoiceData.subtotal),
        discount: Number(invoiceData.discount),
        totalTaxes: Number(invoiceData.totalTaxes),
        total: Number(invoiceData.total),
        notes: invoiceData.notes || undefined,
      },
      lines: invoiceData.lines.map(l => ({
        id: l.id,
        description: 'Producto/Servicio', // Needs join with products if we want name
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        subtotal: Number(l.subtotal),
        total: Number(l.total),
      })),
      taxes: invoiceData.taxes.map(t => ({
        name: t.taxType,
        amount: Number(t.amount),
        rate: Number(t.rate),
      })),
      modo: invoiceData.modo,
    };

    const { buffer } = await DocumentService.getOrGenerateDocumentPdf(
      type,
      id,
      InvoiceTemplate,
      templateData
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${type}-${id.substring(0, 8)}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('[API/PDF]', error);
    return new NextResponse(`Error generating PDF: ${error.message}`, { status: 500 });
  }
}
