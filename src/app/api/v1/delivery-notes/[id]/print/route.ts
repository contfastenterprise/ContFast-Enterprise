import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { DeliveryRepository } from '@/repositories/deliveryRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, invoices, companies, companySettings, customers, deliveryNoteLines, invoiceLines, products, deliveryNotes } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    // 1. Fetch delivery note
    const note = await DeliveryRepository.getById(id, auth.companyId);
    if (!note) {
      return new NextResponse('Conduce no encontrado.', { status: 404 });
    }

    // 2. Fetch invoice
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, note.invoiceId), eq(invoices.companyId, auth.companyId)))
      .limit(1);

    if (!invoice) {
      return new NextResponse('Factura no encontrada.', { status: 404 });
    }

    // 3. Fetch company profile and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, auth.companyId))
      .limit(1);

    if (!company) {
      return new NextResponse('Perfil de compañía no encontrado.', { status: 404 });
    }

    // 4. Fetch customer
    let customerRecord = null;
    if (invoice.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, invoice.customerId))
        .limit(1);
      customerRecord = cust;
    }

    const customerData = customerRecord ? {
      name: customerRecord.name,
      rncCedula: customerRecord.rncCedula,
      phone: customerRecord.phone || '',
      address: customerRecord.address || ''
    } : {
      name: invoice.buyerName || 'Consumidor Final',
      rncCedula: invoice.buyerRnc || '',
      phone: '',
      address: ''
    };

    // 5. Fetch lines and join with product details
    const noteLines = await db
      .select({
        id: deliveryNoteLines.id,
        productId: deliveryNoteLines.productId,
        quantity: deliveryNoteLines.quantity,
        productName: products.name,
        productSku: products.sku,
        unitOfMeasure: products.unitOfMeasure,
      })
      .from(deliveryNoteLines)
      .leftJoin(products, eq(deliveryNoteLines.productId, products.id))
      .where(eq(deliveryNoteLines.deliveryNoteId, note.id));

    // Get invoice lines for quantities
    const invLines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoice.id));

    // Get other approved delivery notes for this invoice to calculate previouslyDeliveredQty
    const otherNotes = await db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.invoiceId, invoice.id),
          eq(deliveryNotes.status, 'approved'),
          isNull(deliveryNotes.deletedAt)
        )
      );

    const otherLinesMap: Record<string, number> = {};
    for (const otherNote of otherNotes) {
      // Don't include the current note in previously delivered quantities!
      if (otherNote.id === note.id) continue;

      const lines = await db
        .select()
        .from(deliveryNoteLines)
        .where(eq(deliveryNoteLines.deliveryNoteId, otherNote.id));

      for (const l of lines) {
        otherLinesMap[l.productId] = (otherLinesMap[l.productId] || 0) + Number(l.quantity);
      }
    }

    const compiledLines = noteLines.map((l) => {
      const invLine = invLines.find((il) => il.productId === l.productId);
      const invoicedQty = invLine ? Number(invLine.quantity) : 0;
      const previouslyDeliveredQty = otherLinesMap[l.productId] || 0;

      return {
        productName: l.productName || 'Artículo',
        productSku: l.productSku || 'N/A',
        unitOfMeasure: l.unitOfMeasure || 'Unidad',
        quantity: Number(l.quantity),
        invoicedQty,
        previouslyDeliveredQty,
      };
    });

    const docRecord = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: '',
        email: '',
        logoUrl: settings?.logoUrl || undefined,
      },
      customer: customerData,
      invoice: {
        ncf: invoice.ncf,
        codigoFactura: invoice.codigoFactura,
      },
      deliveryNote: {
        deliveryNumber: note.deliveryNumber,
        deliveryDate: note.deliveryDate,
        status: note.status,
        driverName: note.driverName,
        driverLicense: note.driverLicense,
        vehiclePlate: note.vehiclePlate,
        dispatcherName: note.dispatcherName,
        notes: note.notes,
      },
      lines: compiledLines,
    };

    const html = DocumentTemplates.renderDeliveryNote(docRecord);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const customerName = customerData.name || 'Cliente';
    const reason = 'Conduce';
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;

    const cleanCustomerName = customerName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const cleanNum = note.deliveryNumber.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const finalFilename = `${cleanCustomerName} - ${reason} - ${cleanNum} - ${printDate}.pdf`;

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${finalFilename}"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating delivery note print GET:', error);
    return new NextResponse(`Error al generar vista de impresión de conduce: ${error.message}`, {
      status: 500
    });
  }
}
