import { db, invoices, invoiceLines, invoiceTaxes, products, customers, invoiceRetentions } from '@/db';
import { eq, and, isNull, desc, count, notInArray, gte, inArray, sql } from 'drizzle-orm';

export interface CreateInvoiceInput {
  companyId: string;
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
  static async getById(id: string, companyId: string) {
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
        pdfPath: invoices.pdfPath,
        msellerTrackId: invoices.msellerTrackId,
        buyerRnc: invoices.buyerRnc,
        buyerName: invoices.buyerName,
        notes: invoices.notes,
        dgiiMessage: invoices.dgiiMessage,
        paymentType: invoices.paymentType,
        bankName: invoices.bankName,
        transactionNumber: invoices.transactionNumber,
        modifiedNcf: invoices.modifiedNcf,
        modifiedInvoiceId: invoices.modifiedInvoiceId,
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
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
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

    const retentionsData = await db
      .select()
      .from(invoiceRetentions)
      .where(eq(invoiceRetentions.invoiceId, id));

    return {
      ...invoice,
      lines,
      taxes,
      retentions: retentionsData,
    };
  }

  /**
   * Paginated invoice list with tenancy check.
   */
  static async list(companyId: string, page = 1, perPage = 20, options?: { excludeTypes?: string[] }) {
    const offset = (page - 1) * perPage;

    const baseConditions = [
      eq(invoices.companyId, companyId),
      isNull(invoices.deletedAt),
    ];

    if (options?.excludeTypes && options.excludeTypes.length > 0) {
      baseConditions.push(notInArray(invoices.ecfType, options.excludeTypes));
    }

    const [totalResult] = await db
      .select({ value: count() })
      .from(invoices)
      .where(and(...baseConditions));

    const data = await db
      .select()
      .from(invoices)
      .where(and(...baseConditions))
      .orderBy(desc(invoices.createdAt))
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
   * Retrieves dynamic invoice stats for the current month and pending count.
   */
  static async getStats(companyId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthTotalResult] = await db
      .select({ value: sql<string>`coalesce(sum(${invoices.total}), '0')` })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          isNull(invoices.deletedAt),
          gte(invoices.createdAt, startOfMonth),
          notInArray(invoices.ecfType, ['33', '34', '03', '04'])
        )
      );

    const [pendingResult] = await db
      .select({ value: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          isNull(invoices.deletedAt),
          inArray(invoices.status, ['draft', 'signed', 'submitted'])
        )
      );

    return {
      totalMonth: parseFloat(monthTotalResult?.value || '0'),
      pending: pendingResult?.value || 0,
    };
  }

  /**
   * Updates an invoice status.
   */
  static async updateStatus(id: string, companyId: string, status: string, paths?: { xmlPath?: string; signedXmlPath?: string; pdfPath?: string }) {
    const [updated] = await db
      .update(invoices)
      .set({
        status: status as any,
        ...paths,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
      .returning();

    return updated;
  }
}
