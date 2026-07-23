import { db, invoices, invoiceLines, invoiceTaxes, products, customers, invoiceRetentions, RepositoryContext, withTenantMode } from '@/db';
import { eq, and, or, isNull, desc, count, notInArray, gte, lte, ilike, inArray, sql } from 'drizzle-orm';

export interface CreateInvoiceInput {
  companyId: string;
  modo?: 'PRODUCCION' | 'PRUEBA';
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
  lines: {
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    total: number;
    warehouseId?: string;
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
          modo: data.modo || 'PRODUCCION',
          warehouseId: data.warehouseId,
          customerId: data.customerId,
          userId: data.userId,
          cashSessionId: data.cashSessionId,
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
  static async getById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
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
        quantity: invoiceLines.quantity,
        unitPrice: invoiceLines.unitPrice,
        discount: invoiceLines.discount,
        subtotal: invoiceLines.subtotal,
        total: invoiceLines.total,
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
