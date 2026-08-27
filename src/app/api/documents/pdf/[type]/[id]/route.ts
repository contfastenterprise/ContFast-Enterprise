import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invoices } from '@/db/schema/invoices';
import { companies } from '@/db/schema/companies';
import { customers } from '@/db/schema/contacts';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { DocumentService } from '@/services/documents/documentService';
import { InvoiceTemplate } from '@/components/documents/templates/InvoiceTemplate';
// Ideally you would have an Auth check here using your standard auth provider (e.g. Supabase Auth)
// import { createClient } from '@/utils/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    // Auditoria F0-03: estas rutas no verificaban sesion ni empresa, y quedaban fuera
    // del matcher del proxy. Cualquiera con el UUID de una factura podia descargar su
    // PDF, reenviarla por correo a un destinatario arbitrario o generar un enlace
    // publico de 30 dias, sin autenticarse y sin importar de que empresa fuera.
    const auth = await verifyAuth(req);
    if (!auth) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const resolvedParams = await params;
    const { type, id } = resolvedParams;

    if (type !== 'invoice') {
      return new NextResponse('Unsupported document type', { status: 400 });
    }

    const invoiceData = await db.query.invoices.findFirst({
      // El filtro por companyId es lo que impide leer facturas de otra empresa.
      where: and(eq(invoices.id, id), eq(invoices.companyId, auth.companyId)),
      with: {
        company: true,
        customer: true,
        lines: true,
        taxes: true,
      }
    }) as any;

    if (!invoiceData) {
      return new NextResponse('Documento no encontrado', { status: 404 });
    }

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
      lines: invoiceData.lines?.map((l: any) => ({
        id: l.id,
        description: 'Producto/Servicio', // Needs join with products if we want name
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        subtotal: Number(l.subtotal),
        total: Number(l.total),
      })) || [],
      taxes: invoiceData.taxes?.map((t: any) => ({
        name: t.taxType,
        amount: Number(t.amount),
        rate: Number(t.rate),
      })) || [],
      modo: invoiceData.modo,
    };

    const { buffer } = await DocumentService.getOrGenerateDocumentPdf(
      type,
      id,
      InvoiceTemplate,
      templateData
    );

    return new NextResponse(new Uint8Array(buffer), {
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
