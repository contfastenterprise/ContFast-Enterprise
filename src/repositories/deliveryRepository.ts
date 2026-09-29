import { db, deliveryNotes, deliveryNoteLines, invoices, invoiceLines, journalEntries, products, inventoryLevels, type DbOTx, type DbTransaction } from '@/db';
import { repartoDelDespacho } from '@/services/inventario/faltanteDelConduce';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { eq, and, isNull, desc, count, like, inArray } from 'drizzle-orm';
import { checkStockBatch, deductStock } from '@/services/inventoryService';
import { AccountRepository } from '@/repositories/accountRepository';
import { resolverCuentaPorMapeo, resolverCuentaDeInventario } from '@/services/accounting/resolverCuentas';

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
    tx: DbOTx = db
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
  static async getById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', tx: DbOTx = db) {
    //  Lote 224: `tx` opcional. Quien parte un conduce reescribe sus renglones
    //  DENTRO de una transaccion y luego lo aprueba en la misma: leer con `db`
    //  veria los renglones de antes, sin confirmar todavia.
    const [note] = await tx
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

    const lines = await tx
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
    return await db.transaction((tx) => this.aprobarEnTx(tx, id, userId, companyId, modo));
  }

  /**
   * Lote 224: el cuerpo de `approve`, SIN abrir su transaccion, para que
   * `despacharLoDisponible` pueda partir el conduce y aprobarlo en UNA sola: si
   * la aprobacion falla, tambien se deshace el reparto. `approve` hace lo de
   * siempre; lo unico que cambia es que el conduce se lee DENTRO de la
   * transaccion (antes `getById` leia fuera; la guarda de P1-09 sigue abajo).
   */
  static async aprobarEnTx(
    tx: DbTransaction,
    id: string,
    userId: string,
    companyId: string,
    modo: ModoOperativo
  ) {
    {
      // 1. Fetch delivery note
      const note = await this.getById(id, companyId, modo, tx);
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
      //
      // Auditoria P2-28 (2026-09-03): la comprobacion de existencias se hacia
      // linea a linea dentro de este bucle, y cada `checkStock` son DOS
      // consultas. Un conduce de 30 lineas eran 60 consultas, y encima aqui
      // dentro, con la transaccion manteniendo bloqueadas las filas de
      // inventario. Ahora se resuelven todas de una vez, en dos consultas.
      //
      // Sin `modo` estas comprobaciones caian en el valor por defecto
      // 'PRODUCCION': aprobar un conduce en PRUEBA comprobaba y descontaba las
      // existencias REALES.
      const hayExistencia = await checkStockBatch(
        companyId,
        modo,
        invoice.warehouseId!,
        note.lines.map((l) => ({ productId: l.productId, quantityNeeded: Number(l.quantity) })),
        tx
      );

      // Auditoria (2026-09-09): un conduce puede traer el MISMO producto en dos
      // lineas, y las comprobaciones de abajo se hacian linea a linea contra el
      // total entero. Facturaste 10 y el conduce lleva dos lineas de 8: cada una
      // se comparaba con los 10 y pasaba. Se despachaban 16.
      //
      // Y la FACTURA tambien puede repetir producto: `invLines.find` se quedaba
      // con la primera linea, asi que una factura con el producto en dos lineas
      // de 5 contaba 5 facturados en vez de 10 y rechazaba entregas legitimas.
      // Ese falla al reves que el otro, pero es el mismo error.
      //
      // Las dos se arreglan igual: sumar por producto antes de comparar.
      const facturadoPorProducto = new Map<string, number>();
      for (const il of invLines) {
        facturadoPorProducto.set(
          il.productId,
          (facturadoPorProducto.get(il.productId) || 0) + Number(il.quantity)
        );
      }

      const pedidoPorProducto = new Map<string, number>();
      for (const l of note.lines) {
        pedidoPorProducto.set(
          l.productId,
          (pedidoPorProducto.get(l.productId) || 0) + Number(l.quantity)
        );
      }

      for (const [idx, line] of note.lines.entries()) {
        const invoicedQty = facturadoPorProducto.get(line.productId) || 0;
        const previouslyDelivered = deliveredMap[line.productId] || 0;
        // El TOTAL de este conduce para este producto, no el de esta linea. Asi
        // el mensaje tampoco miente: dice lo que de verdad se esta pidiendo.
        const currentQty = pedidoPorProducto.get(line.productId) || 0;

        if (previouslyDelivered + currentQty > invoicedQty) {
          throw new Error(
            `Exceso de entrega para el producto ID ${line.productId}. Facturado: ${invoicedQty}, Entregado anteriormente: ${previouslyDelivered}, Solicitado: ${currentQty}.`
          );
        }

        if (!hayExistencia[idx]) {
          throw new Error(
            `Inventario insuficiente en el almacén para despachar el producto ${line.productId}: ` +
            `se solicitan ${currentQty} unidades.`
          );
        }
      }

      // 5. Deduct stock and write movements
      let costoDeVentaTotal = 0;
      for (const line of note.lines) {
        const currentQty = Number(line.quantity);
        const { averageCost } = await deductStock(
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
        costoDeVentaTotal += currentQty * averageCost;
      }

      // 5b. Asiento de Costo de Venta (Auditoria P1-12, 2026-09-05).
      //
      // Hasta ahora despachar descontaba el kardex pero nunca contabilizaba
      // el costo de esa mercancia -- el asiento de la factura
      // (invoiceDbBooker.ts) solo registra el INGRESO (Ventas/CxC/ITBIS),
      // nunca el costo. El resultado se veia bien en ingresos y mal en
      // margen: la utilidad bruta salia inflada por el valor entero de lo
      // vendido, sin restarle nada.
      //
      // El costo es el promedio ponderado vigente al momento del despacho
      // (`averageCost`, devuelto por `deductStock` -- P1-12 en
      // inventoryService.ts), no el de la factura ni el de una compra en
      // particular. `reference = id` (el conduce, no la factura): asi
      // `void()`, mas abajo, revierte SOLO este asiento de costo sin tocar
      // el asiento de ingreso de la factura, que es un documento aparte.
      //
      // Si el promedio vigente es cero (producto que nunca entro con costo
      // conocido -- ver P1-12 en inventoryService.ts) no hay nada que
      // contabilizar: `createJournalEntry` rechaza un asiento en cero, y
      // asentar un costo inventado seria peor que no asentar nada.
      if (costoDeVentaTotal > 0.004) {
        const accCosto = await resolverCuentaPorMapeo(tx, companyId, 'cost_of_goods_sold', '5.1.01', 'Despacho - Costo de Venta');
        const accInventario = await resolverCuentaDeInventario(tx, companyId, 'Despacho - Inventario de Mercancía');
        const monto = Math.round(costoDeVentaTotal * 100) / 100;
        await AccountRepository.createJournalEntry(tx, {
          companyId,
          modo,
          reference: id,
          date: new Date().toISOString().split('T')[0],
          description: `Costo de Venta - Conduce ${note.deliveryNumber}`,
          lines: [
            { accountId: accCosto.id, debit: monto, credit: 0 },
            { accountId: accInventario.id, debit: 0, credit: monto },
          ],
          createdBy: userId,
        });
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
    }
  }

  /**
   * Lote 224: despachar LO DISPONIBLE de un borrador y dejar el resto pendiente.
   *
   * Pedido del dueño. En UNA transaccion: el borrador se queda con lo que se
   * puede sacar (`repartoDelDespacho`, la regla de la aprobacion) y se aprueba
   * con la aprobacion de siempre -- descuenta existencia, asienta costo de venta
   * y marca la entrega parcial --, y lo pendiente pasa a un borrador NUEVO de la
   * misma factura. Ese borrador nuevo es el que mantiene vivo el aviso del panel
   * (lote 221): sin el, lo que falta por entregar se quedaria sin nadie que lo
   * recuerde.
   *
   * Si alcanza para todo, es la aprobacion normal; si no alcanza para nada, se
   * niega. El conduce se BLOQUEA antes de leerlo: dos pulsaciones a la vez no
   * pueden partirlo dos veces.
   *
   * MUTANTE EQUIVALENTE, A SABIENDAS: quitar el `.for('update')` no cambia el
   * resultado -- medido en el banco de integracion --, porque la guarda de P1-09
   * dentro de `aprobarEnTx` (el UPDATE condicionado a 'draft') hace que la
   * segunda pulsacion pierda y deshaga TODO lo suyo, reparto incluido. Se queda
   * porque sin el la segunda transaccion parte el conduce, crea un borrador y
   * descuenta existencia para nada antes de perder, y porque dice en voz alta
   * que esto no se puede hacer dos veces a la vez.
   */
  static async despacharLoDisponible(id: string, userId: string, companyId: string, modo: ModoOperativo) {
    return await db.transaction(async (tx) => {
      const [bloqueado] = await tx
        .select({ id: deliveryNotes.id, estado: deliveryNotes.status })
        .from(deliveryNotes)
        .where(and(
          eq(deliveryNotes.id, id),
          eq(deliveryNotes.companyId, companyId),
          eq(deliveryNotes.modo, modo),
          isNull(deliveryNotes.deletedAt),
        ))
        .for('update');
      if (!bloqueado) throw new Error('Conduce no encontrado.');
      if (bloqueado.estado !== 'draft') throw new Error('Solo se puede despachar en parte un conduce en borrador.');

      const note = await this.getById(id, companyId, modo, tx);
      if (!note) throw new Error('Conduce no encontrado.');

      const [invoice] = await tx
        .select({ id: invoices.id, warehouseId: invoices.warehouseId })
        .from(invoices)
        .where(and(eq(invoices.id, note.invoiceId), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!invoice?.warehouseId) throw new Error('Factura de referencia no encontrada.');

      const ids = [...new Set(note.lines.map((l) => l.productId))];
      const [productos, niveles] = await Promise.all([
        tx.select({ id: products.id, nombre: products.name, sku: products.sku, lleva: products.tracksInventory })
          .from(products)
          .where(and(eq(products.companyId, companyId), inArray(products.id, ids))),
        tx.select({ productId: inventoryLevels.productId, quantity: inventoryLevels.quantity, minStock: inventoryLevels.minStock })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.companyId, companyId),
            eq(inventoryLevels.warehouseId, invoice.warehouseId),
            eq(inventoryLevels.modo, modo),
            inArray(inventoryLevels.productId, ids),
          )),
      ]);
      const producto = new Map(productos.map((p) => [p.id, p]));
      const nivel = new Map(niveles.map((n) => [n.productId, n]));

      const reparto = repartoDelDespacho(note.lines.map((l) => ({
        productId: l.productId,
        nombre: producto.get(l.productId)?.nombre ?? '',
        sku: producto.get(l.productId)?.sku ?? null,
        pedido: l.quantity,
        existencia: nivel.get(l.productId)?.quantity ?? 0,
        minimo: nivel.get(l.productId)?.minStock ?? 0,
        llevaInventario: producto.get(l.productId)?.lleva ?? true,
      })));

      if (reparto.despachar.length === 0) {
        throw new Error('No hay existencia para despachar ninguna mercancía de este conduce.');
      }
      if (reparto.pendiente.length === 0) {
        const r = await this.aprobarEnTx(tx, id, userId, companyId, modo);
        return { despachado: r.deliveryNumber, pendiente: null as string | null };
      }

      //  El borrador se queda con lo que sale...
      await tx.delete(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id));
      await tx.insert(deliveryNoteLines).values(
        reparto.despachar.map((d) => ({ deliveryNoteId: id, productId: d.productId, quantity: d.cantidad.toString() }))
      );

      //  ...y lo pendiente pasa a un borrador nuevo de la misma factura, con los
      //  mismos datos de transporte, que se pueden cambiar al despacharlo.
      const numero = await this.getNextDeliveryNumber(companyId, modo, tx);
      const [pendiente] = await tx.insert(deliveryNotes).values({
        companyId,
        modo,
        invoiceId: note.invoiceId,
        userId,
        deliveryNumber: numero,
        deliveryDate: note.deliveryDate,
        driverName: note.driverName,
        driverLicense: note.driverLicense,
        vehiclePlate: note.vehiclePlate,
        dispatcherName: note.dispatcherName,
        notes: `Pendiente del conduce ${note.deliveryNumber}.`,
        status: 'draft',
      }).returning({ id: deliveryNotes.id });
      await tx.insert(deliveryNoteLines).values(
        reparto.pendiente.map((p) => ({ deliveryNoteId: pendiente.id, productId: p.productId, quantity: p.cantidad.toString() }))
      );

      const r = await this.aprobarEnTx(tx, id, userId, companyId, modo);
      return { despachado: r.deliveryNumber, pendiente: numero as string | null };
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

      // 3b. Revertir el asiento de Costo de Venta de este conduce, si lo hubo
      // (Auditoria P1-12, 2026-09-05). Se busca por `reference = id`: es
      // exactamente como quedo marcado al aprobarse, en el paso 5b de
      // `approve`. Mismo criterio que la reversion de asientos de compra
      // (P0-07): el original queda intacto, se inserta un reverso con el
      // debe y el haber invertidos, y `revertirAsientoContable` ya trae su
      // propia guarda de "no revertir dos veces".
      const [asientoCosto] = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.reference, id),
          eq(journalEntries.companyId, companyId),
          eq(journalEntries.modo, modo)
        ))
        .limit(1);
      if (asientoCosto) {
        await AccountRepository.revertirAsientoContable(
          tx,
          companyId,
          modo,
          asientoCosto.id,
          `Conduce anulado ${note.deliveryNumber}`,
          userId
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
