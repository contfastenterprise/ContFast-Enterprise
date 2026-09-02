import { db, invoices, invoiceLines, invoiceTaxes, products, customers, invoiceRetentions, RepositoryContext, withTenantMode } from '@/db';
import { eq, and, or, isNull, desc, count, notInArray, gte, lte, ilike, inArray, sql } from 'drizzle-orm';

export interface CreateInvoiceInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  warehouseId: string;
  customerId?: string;
  userId: string;
  cashSessionId?: string;
  ncf: string;
  ecfType: string;
  status: 'draft' | 'signed' | 'submitted' | 'accepted' | 'rejected' | 'void';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentType: 'cash' | 'credit' | 'bank_transfer';
  bankName?: string;
  transactionNumber?: string;
  subtotal: number;
  discount: number;
  totalTaxes: number;
  total: number;
  totalRetained?: number;
  totalNet?: number;
  xmlPath?: string;
  signedXmlPath?: string;
  msellerXmlPath?: string;
  pdfPath?: string;
  msellerTrackId?: string;
  dgiiMessage?: string;
  buyerRnc?: string;
  buyerName?: string;
  notes?: string;
  modifiedNcf?: string;
  modifiedInvoiceId?: string;
  indicadorNotaCredito?: number;
  codigoFactura?: string;
  deliveryStatus?: string;
  quoteId?: string;
  /**
   * LA FIRMA QUE DEVUELVE mSELLER AL EMITIR.
   *
   * mSeller firma en el momento y devuelve `securityCode` y `qr_url` en la
   * respuesta del envio; el VEREDICTO de la DGII, en cambio, llega despues, al
   * consultar el estado. Son dos cosas distintas y llegan en dos momentos
   * distintos.
   *
   * Estos campos no existian aqui, asi que la firma se guardaba unicamente en
   * `dgii_submissions` y la factura se quedaba sin ella hasta que alguien
   * pulsaba "sincronizar". Por eso el comprobante recien emitido salia sin
   * codigo y sin QR aunque mSeller ya los hubiera dado.
   */
  securityCode?: string | null;
  signatureDate?: string | null;
  qrUrl?: string | null;
  lines: {
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    total: number;
    warehouseId?: string;
    /** Tasa de ITBIS de la linea, como FRACCION (0.18 = 18%). Ver migracion 0039. */
    taxRate?: number;
    taxCategory?: 'exento' | 'tasa_cero' | null;
  }[];
  taxes: {
    taxType: string;
    rate: number;
    amount: number;
  }[];
  retentions?: {
    retentionId?: string;
    retentionName: string;
    retentionType: 'ITBIS' | 'ISR' | 'OTRA';
    retentionPercentage: number;
    retentionAmount: number;
    agentRnc?: string;
    retentionDate?: string;
  }[];
}

export class InvoiceRepository {
  /**
   * Creates an invoice with its lines, taxes and retentions in a transaction.
   */
  static async create(data: CreateInvoiceInput, externalTx?: any) {
    const runInTx = async (tx: any) => {
      // 1. Insert Invoice
      const [invoice] = await tx
        .insert(invoices)
        .values({
          companyId: data.companyId,
          modo: data.modo,
          warehouseId: data.warehouseId,
          customerId: data.customerId,
          userId: data.userId,
          cashSessionId: data.cashSessionId,
          // El enlace con la cotizacion de origen. Estaba declarado en el tipo,
          // el formulario lo enviaba, el esquema Zod lo validaba y el `select`
          // de mas abajo lo devolvia... pero el INSERT no lo escribia, asi que
          // `invoices.quote_id` era SIEMPRE nulo.
          //
          // No es solo trazabilidad perdida: cualquier comprobacion del tipo
          // "que facturas salieron de una cotizacion" da cero por construccion,
          // y por tanto no puede demostrar que no haya problemas. Un dato que
          // no se guarda no es un dato ausente: es una respuesta falsa.
          quoteId: data.quoteId,
          ncf: data.ncf,
          ecfType: data.ecfType,
          status: data.status,
          paymentStatus: data.paymentStatus,
          subtotal: data.subtotal.toString(),
          discount: data.discount.toString(),
          totalTaxes: data.totalTaxes.toString(),
          total: data.total.toString(),
          totalRetained: (data.totalRetained || 0).toString(),
          totalNet: (data.totalNet ?? data.total).toString(),
          xmlPath: data.xmlPath,
          signedXmlPath: data.signedXmlPath,
          msellerXmlPath: data.msellerXmlPath,
          pdfPath: data.pdfPath,
          msellerTrackId: data.msellerTrackId,
          dgiiMessage: data.dgiiMessage,
          buyerRnc: data.buyerRnc,
          buyerName: data.buyerName,
          notes: data.notes,
          paymentType: data.paymentType,
          bankName: data.bankName,
          transactionNumber: data.transactionNumber,
          modifiedNcf: data.modifiedNcf,
          modifiedInvoiceId: data.modifiedInvoiceId,
          indicadorNotaCredito: data.indicadorNotaCredito ?? null,
          codigoFactura: data.codigoFactura,
          // Se guarda lo que mSeller haya devuelto YA. Nulo si no vino: la
          // firma no se fabrica, pero tampoco se tira si esta.
          securityCode: data.securityCode ?? null,
          signatureDate: data.signatureDate ?? null,
          qrUrl: data.qrUrl ?? null,
        })
        .returning();

      // 2. Insert Lines
      if (data.lines.length > 0) {
        await tx.insert(invoiceLines).values(
          data.lines.map((line) => ({
            invoiceId: invoice.id,
            productId: line.productId,
            warehouseId: line.warehouseId || data.warehouseId,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discount: line.discount.toString(),
            subtotal: line.subtotal.toString(),
            total: line.total.toString(),
            // La tasa de la linea se GUARDA. Antes no habia donde, y por eso
            // al recuperar la factura todo el mundo se la inventaba (18%).
            taxRate: line.taxRate != null ? line.taxRate.toString() : null,
            //  La categoria del cero se guarda como la dijo quien facturo. No se
            //  deduce: 'exento' y 'tasa_cero' son decisiones fiscales distintas.
            taxCategory: line.taxCategory ?? null,
          }))
        );
      }

      // 3. Insert Taxes
      if (data.taxes.length > 0) {
        await tx.insert(invoiceTaxes).values(
          data.taxes.map((tax) => ({
            invoiceId: invoice.id,
            taxType: tax.taxType,
            rate: tax.rate.toString(),
            amount: tax.amount.toString(),
          }))
        );
      }

      // 4. Insert Retentions (if provided)
      if (data.retentions && data.retentions.length > 0) {
        await tx.insert(invoiceRetentions).values(
          data.retentions.map((ret) => ({
            invoiceId: invoice.id,
            retentionId: ret.retentionId || null,
            retentionName: ret.retentionName,
            retentionType: ret.retentionType,
            retentionPercentage: ret.retentionPercentage.toString(),
            retentionAmount: ret.retentionAmount.toString(),
            agentRnc: ret.agentRnc || null,
            retentionDate: ret.retentionDate || null,
            createdBy: data.userId,
          }))
        );
      }

      return invoice;
    };

    if (externalTx) {
      return await runInTx(externalTx);
    }
    return await db.transaction(runInTx);
  }

  /**
   * Fetches an invoice by ID, ensuring tenancy checks.
   */
  // `modo` es OBLIGATORIO. Tenia 'PRODUCCION' por defecto y cuatro llamadores lo
  // omitian, asi que en PRUEBA devolvia la factura del otro entorno o nada --
  // uno de ellos, delivery-notes, en un camino de escritura.
  static async getById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const ctx = { companyId, modo };
    const [invoice] = await db
      .select({
        id: invoices.id,
        companyId: invoices.companyId,
        warehouseId: invoices.warehouseId,
        customerId: invoices.customerId,
        userId: invoices.userId,
        cashSessionId: invoices.cashSessionId,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        totalRetained: invoices.totalRetained,
        totalNet: invoices.totalNet,
        xmlPath: invoices.xmlPath,
        signedXmlPath: invoices.signedXmlPath,
        msellerXmlPath: invoices.msellerXmlPath,
        pdfPath: invoices.pdfPath,
        msellerTrackId: invoices.msellerTrackId || null,
        buyerRnc: invoices.buyerRnc || null,
        buyerName: invoices.buyerName || null,
        notes: invoices.notes || null,
        dgiiMessage: invoices.dgiiMessage || null,
        paymentType: invoices.paymentType,
        bankName: invoices.bankName || null,
        transactionNumber: invoices.transactionNumber || null,
        modifiedNcf: invoices.modifiedNcf || null,
        modifiedInvoiceId: invoices.modifiedInvoiceId || null,
        codigoFactura: invoices.codigoFactura,
        // La firma del comprobante (0042 y 0043). Este SELECT enumera las
        // columnas una a una, y una lista explicita no falla al anadir una
        // nueva: la ignora en silencio. El PDF, el correo y el detalle recibian
        // `undefined` y el comprobante salia marcado como pendiente aunque la
        // factura tuviera la firma guardada.
        securityCode: invoices.securityCode,
        signatureDate: invoices.signatureDate,
        qrUrl: invoices.qrUrl,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(withTenantMode(invoices, ctx, eq(invoices.id, id), isNull(invoices.deletedAt)))
      .limit(1);

    if (!invoice) return null;

    const lines = await db
      .select({
        id: invoiceLines.id,
        invoiceId: invoiceLines.invoiceId,
        productId: invoiceLines.productId,
        // El almacen de ESTA linea. Se guarda desde siempre (`create` lo
        // escribe), pero aqui no se leia: el detalle salia sin el y la nota de
        // credito devolvia TODA la mercancia al almacen general del formulario.
        // En una factura despachada desde varios almacenes, el inventario
        // volvia al que no era.
        warehouseId: invoiceLines.warehouseId,
        quantity: invoiceLines.quantity,
        unitPrice: invoiceLines.unitPrice,
        discount: invoiceLines.discount,
        subtotal: invoiceLines.subtotal,
        total: invoiceLines.total,
        // La tasa de ITBIS de la linea (0039). Faltaba en este SELECT, y por
        // eso el reenvio en cola de `jobRunners` no tenia de donde sacarla y
        // mandaba 0.18 a pelo a la DGII.
        taxRate: invoiceLines.taxRate,
        taxCategory: invoiceLines.taxCategory,
        createdAt: invoiceLines.createdAt,
        updatedAt: invoiceLines.updatedAt,
        productName: products.name,
        productSku: products.sku,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .where(eq(invoiceLines.invoiceId, id));

    const taxes = await db
      .select()
      .from(invoiceTaxes)
      .where(eq(invoiceTaxes.invoiceId, id));

    const retentions = await db
      .select()
      .from(invoiceRetentions)
      .where(eq(invoiceRetentions.invoiceId, id));

    return {
      ...invoice,
      lines,
      taxes,
      retentions,
    };
  }

  /**
   * Paginated invoice list with tenancy check.
   */
  static async list(
    companyId: string,
    page = 1,
    perPage = 20,
    options?: {
      excludeTypes?: string[];
      status?: string;
      ncf?: string;
      ecfType?: string;
      startDate?: string;
      endDate?: string;
    },
    modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
  ) {
    const ctx = { companyId, modo };
    const offset = (page - 1) * perPage;

    const baseConditions = [
      isNull(invoices.deletedAt),
    ];

    if (options?.excludeTypes && options.excludeTypes.length > 0) {
      baseConditions.push(notInArray(invoices.ecfType, options.excludeTypes));
    }

    if (options?.status) {
      baseConditions.push(eq(invoices.status, options.status as any));
    }

    if (options?.ecfType) {
      baseConditions.push(eq(invoices.ecfType, options.ecfType));
    }

    if (options?.ncf) {
      const searchCond = or(
        ilike(invoices.ncf, `%${options.ncf}%`),
        ilike(invoices.buyerName, `%${options.ncf}%`),
        ilike(invoices.buyerRnc, `%${options.ncf}%`),
        ilike(customers.name, `%${options.ncf}%`),
        ilike(customers.rncCedula, `%${options.ncf}%`)
      );
      if (searchCond) {
        baseConditions.push(searchCond);
      }
    }

    if (options?.startDate) {
      baseConditions.push(gte(invoices.createdAt, new Date(`${options.startDate}T00:00:00-04:00`)));
    }

    if (options?.endDate) {
      baseConditions.push(lte(invoices.createdAt, new Date(`${options.endDate}T23:59:59.999-04:00`)));
    }

    const [totalResult] = await db
      .select({ value: count() })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(withTenantMode(invoices, ctx, ...baseConditions));

    const data = await db
      .select({
        id: invoices.id,
        companyId: invoices.companyId,
        warehouseId: invoices.warehouseId,
        customerId: invoices.customerId,
        userId: invoices.userId,
        cashSessionId: invoices.cashSessionId,
        quoteId: invoices.quoteId,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        xmlPath: invoices.xmlPath,
        signedXmlPath: invoices.signedXmlPath,
        msellerXmlPath: invoices.msellerXmlPath,
        pdfPath: invoices.pdfPath,
        msellerTrackId: invoices.msellerTrackId,
        buyerRnc: invoices.buyerRnc,
        buyerName: invoices.buyerName,
        dgiiMessage: invoices.dgiiMessage,
        notes: invoices.notes,
        paymentType: invoices.paymentType,
        bankName: invoices.bankName,
        transactionNumber: invoices.transactionNumber,
        modifiedNcf: invoices.modifiedNcf,
        modifiedInvoiceId: invoices.modifiedInvoiceId,
        indicadorNotaCredito: invoices.indicadorNotaCredito,
        codigoFactura: invoices.codigoFactura,
        deliveryStatus: invoices.deliveryStatus,
        totalRetained: invoices.totalRetained,
        totalNet: invoices.totalNet,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        deletedAt: invoices.deletedAt,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(withTenantMode(invoices, ctx, ...baseConditions))
      .orderBy(desc(invoices.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    const [sumResult] = await db
      .select({ value: sql<string>`coalesce(sum(${invoices.total}), '0')` })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(withTenantMode(invoices, ctx, ...baseConditions));

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
        totalAmount: parseFloat(sumResult?.value || '0'),
      },
    };
  }

  /**
   * Retrieves dynamic invoice stats for the current month and pending count.
   */
  static async getStats(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthTotalResult] = await db
      .select({ value: sql<string>`coalesce(sum(${invoices.total}), '0')` })
      .from(invoices)
      .where(
        withTenantMode(
          invoices,
          ctx,
          isNull(invoices.deletedAt),
          gte(invoices.createdAt, startOfMonth),
          notInArray(invoices.ecfType, ['33', '34', '03', '04'])
        )
      );

    const [pendingResult] = await db
      .select({ value: count() })
      .from(invoices)
      .where(
        withTenantMode(
          invoices,
          ctx,
          isNull(invoices.deletedAt),
          inArray(invoices.status, ['draft', 'signed', 'submitted'])
        )
      );

    return {
      monthTotal: parseFloat(monthTotalResult?.value || '0'),
      pendingCount: pendingResult?.value || 0,
    };
  }

  /**
   * Updates an invoice status.
   */
  static async updateStatus(
    id: string,
    companyId: string,
    status: string,
    paths?: { xmlPath?: string; signedXmlPath?: string; msellerXmlPath?: string; pdfPath?: string },
    modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
  ) {
    const ctx = { companyId, modo };
    const [updated] = await db
      .update(invoices)
      .set({
        status: status as any,
        ...paths,
        updatedAt: new Date(),
      })
      .where(withTenantMode(invoices, ctx, eq(invoices.id, id)))
      .returning();

    return updated;
  }
}
