import { db, deliveryNotes, deliveryNoteLines, invoices, invoiceLines } from '@/db';
import { eq, and, isNull, desc, count, like, inArray } from 'drizzle-orm';
import { checkStock, deductStock } from '@/services/inventoryService';

export interface CreateDeliveryNoteInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  invoiceId: string;
  userId: string;
  deliveryDate: Date;
  driverName?: string;
  driverLicense?: string;
  vehiclePlate?: string;
  dispatcherName?: string;
  notes?: string;
  lines: {
    productId: string;
    quantity: number;
  }[];
}

export class DeliveryRepository {
  /**
   * Generates the next automatic sequence number for delivery notes of a company.
   * Format: CON-YYYY-000001 (e.g. CON-2026-000001)
   */
  static async getNextDeliveryNumber(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    tx: any = db
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CON-${year}-`;
    const pattern = `${prefix}%`;

    const lastNotes = await tx
      .select({ deliveryNumber: deliveryNotes.deliveryNumber })
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.companyId, companyId),
          // El indice unico de la tabla es (company_id, delivery_number, modo):
          // el esquema ya daba por hecho que cada entorno numera por su cuenta.
          // El generador no lo hacia, asi que un conduce de practicas consumia
          // un numero de la serie real y le dejaba un hueco.
          eq(deliveryNotes.modo, modo),
          like(deliveryNotes.deliveryNumber, pattern)
        )
      )
      .orderBy(desc(deliveryNotes.deliveryNumber))
      .limit(1);

    let nextSeq = 1;
    if (lastNotes.length > 0 && lastNotes[0].deliveryNumber) {
      const parts = lastNotes[0].deliveryNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    return `${prefix}${nextSeq.toString().padStart(6, '0')}`;
  }

  /**
   * Creates a delivery note in 'draft' status.
   */
  static async create(data: CreateDeliveryNoteInput) {
    return await db.transaction(async (tx) => {
      // 1. Generate unique delivery number
      const deliveryNumber = await this.getNextDeliveryNumber(data.companyId, data.modo, tx);

      // 2. Insert Delivery Note header
      const [note] = await tx
        .insert(deliveryNotes)
        .values({
          companyId: data.companyId,
          modo: data.modo,
          invoiceId: data.invoiceId,
          userId: data.userId,
          deliveryNumber,
          deliveryDate: data.deliveryDate.toISOString().split('T')[0],
          driverName: data.driverName,
          driverLicense: data.driverLicense,
          vehiclePlate: data.vehiclePlate,
          dispatcherName: data.dispatcherName,
          notes: data.notes,
          status: 'draft',
        })
        .returning();

      // 3. Insert Delivery Note lines
      if (data.lines.length > 0) {
        await tx.insert(deliveryNoteLines).values(
          data.lines.map((line) => ({
            deliveryNoteId: note.id,
            productId: line.productId,
            quantity: line.quantity.toString(),
          }))
        );
      }

      return note;
    });
  }

  /**
   * Fetches a delivery note by ID, including its lines.
   */
  static async getById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const [note] = await db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.id, id),
          eq(deliveryNotes.companyId, companyId),
          eq(deliveryNotes.modo, modo),
          isNull(deliveryNotes.deletedAt)
        )
      )
      .limit(1);

    if (!note) return null;

    const lines = await db
      .select()
      .from(deliveryNoteLines)
      .where(eq(deliveryNoteLines.deliveryNoteId, id));

    return {
      ...note,
      lines,
    };
  }

  /**
   * Fetches delivery notes for a specific invoice.
   */
  static async getByInvoiceId(
    invoiceId: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA'
  ) {
    // Hoy no la llama nadie. Se deja con el entorno OBLIGATORIO para que quien
    // la estrene no herede el fallo: un metodo sin filtro esperando llamador
    // es una trampa puesta a futuro.
    return await db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.invoiceId, invoiceId),
          eq(deliveryNotes.companyId, companyId),
          eq(deliveryNotes.modo, modo),
          isNull(deliveryNotes.deletedAt)
        )
      )
      .orderBy(desc(deliveryNotes.createdAt));
  }

  /**
   * Lists delivery notes with pagination and tenancy isolation.
   */
  static async list(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    page = 1,
    perPage = 20
  ) {
    const offset = (page - 1) * perPage;

    const [totalResult] = await db
      .select({ value: count() })
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.companyId, companyId),
          eq(deliveryNotes.modo, modo),
          isNull(deliveryNotes.deletedAt)
        )
      );

    const data = await db
      .select()
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.companyId, companyId),
          eq(deliveryNotes.modo, modo),
          isNull(deliveryNotes.deletedAt)
        )
      )
      .orderBy(desc(deliveryNotes.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  /**
   * Approves a delivery note, validating quantities and deducting inventory.
   */
  static async approve(id: string, userId: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    return await db.transaction(async (tx) => {
      // 1. Fetch delivery note
      const note = await this.getById(id, companyId, modo);
      if (!note) {
        throw new Error('Conduce no encontrado.');
      }
      if (note.status !== 'draft') {
        throw new Error('Solo se pueden aprobar conduces en estado borrador.');
      }

      // 2. Fetch invoice and its lines
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, note.invoiceId), eq(invoices.companyId, companyId)))
        .limit(1);

      if (!invoice) {
        throw new Error('Factura de referencia no encontrada.');
      }

      const invLines = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id));

      // 3. Calculate already delivered quantities for this invoice (excluding this note)
      //
      // Aqui NO se filtra por modo, y es deliberado. La factura ya se resolvio
      // con su entorno y su id es clave primaria, asi que estos conduces son
      // suyos. Anadir el filtro tendria el mismo efecto malo que en el arqueo
      // de caja: un conduce heredado con el sello equivocado desapareceria de
      // la suma de lo ya despachado y la factura se podria entregar dos veces.
      const otherNotes = await tx
        .select()
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.invoiceId, invoice.id),
            eq(deliveryNotes.companyId, companyId),
            eq(deliveryNotes.status, 'approved'),
            isNull(deliveryNotes.deletedAt)
          )
        );

      // Query other approved line quantities directly
      const otherNoteIds = otherNotes.map((n) => n.id);
      const otherLines = otherNoteIds.length > 0
        ? await tx
            .select()
            .from(deliveryNoteLines)
            .where(inArray(deliveryNoteLines.deliveryNoteId, otherNoteIds))
        : [];

      const deliveredMap: Record<string, number> = {};
      for (const l of otherLines) {
        deliveredMap[l.productId] = (deliveredMap[l.productId] || 0) + Number(l.quantity);
      }

      // 4. Validate limits and stock availability
      for (const line of note.lines) {
        const invoicedLine = invLines.find((il) => il.productId === line.productId);
        const invoicedQty = invoicedLine ? Number(invoicedLine.quantity) : 0;
        const previouslyDelivered = deliveredMap[line.productId] || 0;
        const currentQty = Number(line.quantity);

        if (previouslyDelivered + currentQty > invoicedQty) {
          throw new Error(
            `Exceso de entrega para el producto ID ${line.productId}. Facturado: ${invoicedQty}, Entregado anteriormente: ${previouslyDelivered}, Solicitado: ${currentQty}.`
          );
        }

        // Verify stock in warehouse
        // Sin `modo` estas dos llamadas caian en el valor por defecto
        // 'PRODUCCION': aprobar un conduce en PRUEBA comprobaba y descontaba
        // las existencias REALES.
        const hasStock = await checkStock(companyId, modo, line.productId, invoice.warehouseId!, currentQty, tx, false);
        if (!hasStock) {
          throw new Error(
            `Inventario insuficiente en el almacén para despachar el producto ${line.productId}: ` +
            `se solicitan ${currentQty} unidades.`
          );
        }
      }

      // 5. Deduct stock and write movements
      for (const line of note.lines) {
        const currentQty = Number(line.quantity);
        await deductStock(
          companyId,
          modo,
          line.productId,
          invoice.warehouseId!,
          currentQty,
          userId,
          'sale',
          invoice.id,
          `Despacho físico Conduce ${note.deliveryNumber}`,
          tx
        );
      }

      // 6. Update Delivery Note Status to Approved
      //
      // Auditoria P1-09 (2026-09-03): `getById`, arriba, lee fuera de esta
      // transaccion y sin bloqueo de fila -- dos aprobaciones a la vez (doble
      // clic, o un reintento) podian pasar el chequeo de 'draft' las dos, y
      // las dos deducian inventario. Igual que ya hace
      // `ApRepository.marcarChequeCobrado`, este UPDATE ahora repite la
      // condicion de estado: solo una de las dos transacciones concurrentes
      // consigue actualizar la fila (Postgres serializa el UPDATE por fila),
      // y la que pierde la carrera revierte -- deshaciendo tambien la
      // deduccion de inventario que ya habia hecho, porque todo esto vive en
      // la misma transaccion.
      const aprobado = await tx
        .update(deliveryNotes)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.status, 'draft')))
        .returning({ id: deliveryNotes.id });

      if (aprobado.length === 0) {
        throw new Error('Este conduce ya fue aprobado (o modificado) por otro proceso mientras se procesaba esta solicitud.');
      }

      // 7. Update Invoice Delivery Status
      // Recalculate totals delivered including this approved note
      for (const line of note.lines) {
        deliveredMap[line.productId] = (deliveredMap[line.productId] || 0) + Number(line.quantity);
      }

      let allDelivered = true;
      let someDelivered = false;

      for (const il of invLines) {
        const delQty = deliveredMap[il.productId] || 0;
        const invQty = Number(il.quantity);
        if (delQty < invQty) {
          allDelivered = false;
        }
        if (delQty > 0) {
          someDelivered = true;
        }
      }

      const nextDeliveryStatus = allDelivered
        ? 'delivered'
        : someDelivered
        ? 'partial'
        : 'pending';

      await tx
        .update(invoices)
        .set({
          deliveryStatus: nextDeliveryStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      return { success: true, deliveryNumber: note.deliveryNumber };
    });
  }

  /**
   * Voids/Cancels an approved delivery note, returning inventory to the warehouse.
   */
  static async void(id: string, userId: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    return await db.transaction(async (tx) => {
      // 1. Fetch delivery note
      const note = await this.getById(id, companyId, modo);
      if (!note) {
        throw new Error('Conduce no encontrado.');
      }
      if (note.status !== 'approved') {
        throw new Error('Solo se pueden anular conduces aprobados.');
      }

      // 2. Fetch related invoice
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, note.invoiceId), eq(invoices.companyId, companyId)))
        .limit(1);

      if (!invoice) {
        throw new Error('Factura de referencia no encontrada.');
      }

      // 3. Return stock (deduct negative quantity)
      for (const line of note.lines) {
        const qty = Number(line.quantity);
        // EL FALLO: esta llamada no pasaba `modo` y caia en el valor por
        // defecto 'PRODUCCION', mientras que la de `approve` si lo pasaba.
        // Anular un conduce de PRUEBA devolvia las unidades al almacen REAL:
        // creaba existencia de la nada en produccion.
        await deductStock(
          companyId,
          modo,
          line.productId,
          invoice.warehouseId!,
          -qty, // Negative quantity to add stock back
          userId,
          'return',
          invoice.id,
          `Devolución por Conduce Anulado ${note.deliveryNumber}`,
          tx
        );
      }

      // 4. Update note status to voided
      await tx
        .update(deliveryNotes)
        .set({
          status: 'voided',
          voidedBy: userId,
          voidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deliveryNotes.id, id));

      // 5. Recalculate invoice delivery status
      const invLines = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id));

      // Sum from remaining approved delivery notes
      const activeNotes = await tx
        .select()
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.invoiceId, invoice.id),
            eq(deliveryNotes.companyId, companyId),
            eq(deliveryNotes.status, 'approved'),
            isNull(deliveryNotes.deletedAt)
          )
        );

      const deliveredMap: Record<string, number> = {};
      for (const n of activeNotes) {
        const lines = await tx
          .select()
          .from(deliveryNoteLines)
          .where(eq(deliveryNoteLines.deliveryNoteId, n.id));
        for (const l of lines) {
          deliveredMap[l.productId] = (deliveredMap[l.productId] || 0) + Number(l.quantity);
        }
      }

      let allDelivered = true;
      let someDelivered = false;

      for (const il of invLines) {
        const delQty = deliveredMap[il.productId] || 0;
        const invQty = Number(il.quantity);
        if (delQty < invQty) {
          allDelivered = false;
        }
        if (delQty > 0) {
          someDelivered = true;
        }
      }

      const nextDeliveryStatus = allDelivered
        ? 'delivered'
        : someDelivered
        ? 'partial'
        : 'pending';

      await tx
        .update(invoices)
        .set({
          deliveryStatus: nextDeliveryStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      return { success: true };
    });
  }

  /**
   * Soft deletes a delivery note (only if it is in draft status).
   */
  static async softDelete(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const note = await this.getById(id, companyId, modo);
    if (!note) {
      throw new Error('Conduce no encontrado.');
    }
    if (note.status !== 'draft') {
      throw new Error('No se puede eliminar un conduce que ya ha sido aprobado o anulado. Solo se pueden eliminar borradores.');
    }

    const [updated] = await db
      .update(deliveryNotes)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.companyId, companyId)))
      .returning();

    return updated;
  }
}
