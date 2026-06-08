import { db, invoices, invoiceLines, invoiceTaxes } from '@/db';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

export interface CreateInvoiceInput {
  companyId: string;
  customerId?: string;
  userId: string;
  cashSessionId?: string;
  ncf: string;
  ecfType: string;
  status: 'draft' | 'signed' | 'submitted' | 'accepted' | 'rejected' | 'void';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  subtotal: number;
  discount: number;
  totalTaxes: number;
  total: number;
  xmlPath?: string;
  signedXmlPath?: string;
  pdfPath?: string;
  msellerTrackId?: string;
  dgiiMessage?: string;
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
}

export class InvoiceRepository {
  /**
   * Creates an invoice with its lines and taxes in a transaction.
   */
  static async create(data: CreateInvoiceInput) {
    return await db.transaction(async (tx) => {
      // 1. Insert Invoice
      const [invoice] = await tx
        .insert(invoices)
        .values({
          companyId: data.companyId,
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
          xmlPath: data.xmlPath,
          signedXmlPath: data.signedXmlPath,
          pdfPath: data.pdfPath,
          msellerTrackId: data.msellerTrackId,
          dgiiMessage: data.dgiiMessage,
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

      return invoice;
    });
  }

  /**
   * Fetches an invoice by ID, ensuring tenancy checks.
   */
  static async getById(id: string, companyId: string) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
      .limit(1);

    if (!invoice) return null;

    const lines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id));

    const taxes = await db
      .select()
      .from(invoiceTaxes)
      .where(eq(invoiceTaxes.invoiceId, id));

    return {
      ...invoice,
      lines,
      taxes,
    };
  }

  /**
   * Paginated invoice list with tenancy check.
   */
  static async list(companyId: string, page = 1, perPage = 20) {
    const offset = (page - 1) * perPage;

    const [totalResult] = await db
      .select({ value: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt)));

    const data = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
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
