import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, deliveryNotes, invoices, invoiceLines, deliveryNoteLines } from '@/db';
import { eq, and, isNull, or, ilike } from 'drizzle-orm';
import { DeliveryRepository } from '@/repositories/deliveryRepository';

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce write permission for invoice/delivery notes
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Debe ingresar un código válido.' } },
        { status: 400, headers: resHeaders }
      );
    }

    const trimmedCode = code.trim();

    // 1. Search for Delivery Note by deliveryNumber (case-insensitive)
    const [existingNote] = await db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          ilike(deliveryNotes.deliveryNumber, trimmedCode),
          eq(deliveryNotes.companyId, auth.companyId),
          isNull(deliveryNotes.deletedAt)
        )
      )
      .limit(1);

    if (existingNote) {
      if (existingNote.status === 'draft') {
        const result = await DeliveryRepository.approve(existingNote.id, auth.userId, auth.companyId);
        return NextResponse.json(
          { success: true, message: `Conduce ${existingNote.deliveryNumber} aprobado y stock descontado exitosamente.` },
          { headers: resHeaders }
        );
      } else if (existingNote.status === 'approved') {
        return NextResponse.json(
          { success: true, message: `El conduce ${existingNote.deliveryNumber} ya está aprobado y su stock fue descontado.` },
          { headers: resHeaders }
        );
      } else {
        return NextResponse.json(
          { success: false, error: { code: 'VOIDED', message: `El conduce ${existingNote.deliveryNumber} está anulado.` } },
          { status: 400, headers: resHeaders }
        );
      }
    }

    // 2. Search for Invoice by NCF or codigoFactura (case-insensitive)
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, auth.companyId),
          isNull(invoices.deletedAt),
          or(
            ilike(invoices.ncf, trimmedCode),
            ilike(invoices.codigoFactura, trimmedCode)
          )
        )
      )
      .limit(1);

    if (invoice) {
      // Find delivery notes for this invoice
      const notes = await db
        .select()
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.invoiceId, invoice.id),
            eq(deliveryNotes.companyId, auth.companyId),
            isNull(deliveryNotes.deletedAt)
          )
        );

      const draftNotes = notes.filter(n => n.status === 'draft');
      if (draftNotes.length > 0) {
        const approvedNames = [];
        for (const draftNote of draftNotes) {
          await DeliveryRepository.approve(draftNote.id, auth.userId, auth.companyId);
          approvedNames.push(draftNote.deliveryNumber);
        }
        return NextResponse.json(
          { success: true, message: `Conduces ${approvedNames.join(', ')} (vinculados a factura ${invoice.ncf || invoice.codigoFactura}) aprobados y stock descontado exitosamente.` },
          { headers: resHeaders }
        );
      }

      // Fetch all invoice lines
      const lines = await db
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id));

      if (lines.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: 'EMPTY_INVOICE', message: 'La factura seleccionada no tiene productos registrados.' } },
          { status: 400, headers: resHeaders }
        );
      }

      // Calculate already delivered quantities for each product across approved notes
      const deliveredMap: Record<string, number> = {};
      const approvedNotes = notes.filter(n => n.status === 'approved');
      for (const n of approvedNotes) {
        const otherLines = await db
          .select()
          .from(deliveryNoteLines)
          .where(eq(deliveryNoteLines.deliveryNoteId, n.id));
        for (const l of otherLines) {
          deliveredMap[l.productId] = (deliveredMap[l.productId] || 0) + Number(l.quantity);
        }
      }

      // Filter to only remaining items that have not been fully delivered yet
      const remainingLines = [];
      for (const l of lines) {
        const invoicedQty = Number(l.quantity);
        const deliveredQty = deliveredMap[l.productId] || 0;
        const remainingQty = invoicedQty - deliveredQty;
        if (remainingQty > 0) {
          remainingLines.push({
            ...l,
            quantity: remainingQty
          });
        }
      }

      if (remainingLines.length === 0) {
        return NextResponse.json(
          { success: true, message: `Todas las mercancías de la factura ${invoice.ncf || invoice.codigoFactura} ya han sido despachadas por completo.` },
          { headers: resHeaders }
        );
      }

      // Group remaining lines by warehouseId
      const linesByWarehouse: Record<string, typeof remainingLines> = {};
      for (const line of remainingLines) {
        const whId = line.warehouseId || invoice.warehouseId || 'default';
        if (!linesByWarehouse[whId]) {
          linesByWarehouse[whId] = [];
        }
        linesByWarehouse[whId].push(line);
      }

      const createdNotes = [];
      for (const [whId, whLines] of Object.entries(linesByWarehouse)) {
        // Resolve a real warehouse ID (use fallback if default is just a string key)
        const targetWarehouseId = whId === 'default' ? null : whId;
        const newNote = await DeliveryRepository.create({
          companyId: auth.companyId,
          invoiceId: invoice.id,
          userId: auth.userId,
          deliveryDate: new Date(),
          notes: 'Generado automáticamente por almacén al aplicar código de barra',
          lines: whLines.map(l => ({
            productId: l.productId,
            quantity: l.quantity
          }))
        });

        // If the newNote created successfully, approve it
        await DeliveryRepository.approve(newNote.id, auth.userId, auth.companyId);
        createdNotes.push(newNote.deliveryNumber);
      }

      return NextResponse.json(
        { success: true, message: `Se crearon y aprobaron los conduces (${createdNotes.join(', ')}) correspondientes por almacén. Stock actualizado.` },
        { headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No se encontró ningún conduce ni factura con el código ingresado.' } },
      { status: 404, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/delivery-notes/apply-code:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
