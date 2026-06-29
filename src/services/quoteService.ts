import { db, quotes, quoteLines, quoteTaxes, quoteSequences, invoices, invoiceLines, invoiceTaxes, customers } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface CreateQuoteInput {
  companyId: string;
  warehouseId?: string;
  customerId?: string;
  userId: string;
  notes?: string;
  lines: {
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }[];
}

export class QuoteService {
  /**
   * Generates a sequence number for a quote (e.g., COT-2026-000001)
   */
  static async generateSequence(companyId: string): Promise<string> {
    const currentYear = new Date().getFullYear();

    return await db.transaction(async (tx) => {
      // Find sequence record for company and year
      const [seqRecord] = await tx
        .select()
        .from(quoteSequences)
        .where(and(
          eq(quoteSequences.companyId, companyId),
          eq(quoteSequences.currentYear, currentYear)
        ))
        .limit(1)
        .for('update'); // lock the row

      let nextSeqNumber = 1;

      if (seqRecord) {
        nextSeqNumber = seqRecord.currentSequence + 1;
        await tx
          .update(quoteSequences)
          .set({ currentSequence: nextSeqNumber, updatedAt: new Date() })
          .where(eq(quoteSequences.id, seqRecord.id));
      } else {
        await tx.insert(quoteSequences).values({
          id: uuidv4(),
          companyId,
          currentYear,
          currentSequence: nextSeqNumber,
        });
      }

      const paddedSeq = String(nextSeqNumber).padStart(6, '0');
      return `COT-${currentYear}-${paddedSeq}`;
    });
  }

  /**
   * Creates a new quote
   */
  static async createQuote(data: CreateQuoteInput) {
    return await db.transaction(async (tx) => {
      const sequenceNumber = await this.generateSequence(data.companyId);

      // Calculate totals
      let subtotal = 0;
      let totalDiscount = 0;
      let totalTaxes = 0;

      const taxableByRate: Record<string, { rate: number; taxableAmount: number }> = {};

      const linesData = data.lines.map((line) => {
        const lineSubtotal = line.quantity * line.unitPrice;
        const lineDiscount = line.quantity * line.discount; // Assume discount sent is unit discount
        const lineTaxable = lineSubtotal - lineDiscount;
        
        subtotal += lineSubtotal;
        totalDiscount += lineDiscount;

        const rateKey = line.taxRate.toString();
        if (!taxableByRate[rateKey]) {
          taxableByRate[rateKey] = { rate: line.taxRate, taxableAmount: 0 };
        }
        taxableByRate[rateKey].taxableAmount += lineTaxable;

        return {
          ...line,
          lineSubtotal,
          lineTotal: lineTaxable, // Save base taxable as line total without tax
          lineDiscount,
        };
      });

      const taxInserts: any[] = [];
      Object.entries(taxableByRate).forEach(([rateStr, val]) => {
        const taxAmount = val.taxableAmount * val.rate;
        totalTaxes += taxAmount;

        if (val.rate > 0) {
          taxInserts.push({
            taxType: 'ITBIS',
            rate: (val.rate * 100).toFixed(2),
            amount: taxAmount.toFixed(2),
          });
        }
      });

      const total = subtotal - totalDiscount + totalTaxes;
      
      const quoteId = uuidv4();

      // Create Quote
      await tx.insert(quotes).values({
        id: quoteId,
        companyId: data.companyId,
        warehouseId: data.warehouseId || null,
        customerId: data.customerId || null,
        userId: data.userId,
        sequenceNumber,
        status: 'pending',
        subtotal: subtotal.toFixed(2),
        discount: totalDiscount.toFixed(2),
        totalTaxes: totalTaxes.toFixed(2),
        total: total.toFixed(2),
        notes: data.notes || '',
        validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Valid for 15 days
      });

      // Insert Lines
      if (linesData.length > 0) {
        await tx.insert(quoteLines).values(
          linesData.map((line) => ({
            id: uuidv4(),
            quoteId,
            productId: line.productId,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            discount: String(line.discount),
            subtotal: String(line.lineSubtotal),
            total: String(line.lineTotal),
          }))
        );

        if (taxInserts.length > 0) {
          await tx.insert(quoteTaxes).values(
            taxInserts.map(t => ({
              id: uuidv4(),
              quoteId,
              taxType: t.taxType,
              rate: t.rate,
              amount: t.amount
            }))
          );
        }
      }

      return { quoteId, sequenceNumber };
    });
  }

  /**
   * Retrieves a quote by ID including lines and taxes
   */
  static async getQuote(quoteId: string) {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) return null;

    const lines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    const taxes = await db.select().from(quoteTaxes).where(eq(quoteTaxes.quoteId, quoteId));

    return { ...quote, lines, taxes };
  }

  /**
   * Update a pending quote
   */
  static async updateQuote(quoteId: string, data: Partial<CreateQuoteInput>) {
    return await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
      if (!quote) throw new Error('Cotización no encontrada');
      if (quote.status !== 'pending') throw new Error('Solo se pueden modificar cotizaciones pendientes');

      // Update lines if provided
      if (data.lines) {
        // Delete old lines and taxes
        await tx.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
        await tx.delete(quoteTaxes).where(eq(quoteTaxes.quoteId, quoteId));

        let subtotal = 0;
        let totalDiscount = 0;
        let totalTaxes = 0;

        const taxableByRate: Record<string, { rate: number; taxableAmount: number }> = {};

        const linesData = data.lines.map((line) => {
          const lineSubtotal = line.quantity * line.unitPrice;
          const lineDiscount = line.quantity * line.discount; // Assume unit discount
          const lineTaxable = lineSubtotal - lineDiscount;
          
          subtotal += lineSubtotal;
          totalDiscount += lineDiscount;

          const rateKey = line.taxRate.toString();
          if (!taxableByRate[rateKey]) {
            taxableByRate[rateKey] = { rate: line.taxRate, taxableAmount: 0 };
          }
          taxableByRate[rateKey].taxableAmount += lineTaxable;

          return {
            ...line,
            lineSubtotal,
            lineTotal: lineTaxable,
            lineDiscount,
          };
        });

        const taxInserts: any[] = [];
        Object.entries(taxableByRate).forEach(([rateStr, val]) => {
          const taxAmount = val.taxableAmount * val.rate;
          totalTaxes += taxAmount;

          if (val.rate > 0) {
            taxInserts.push({
              taxType: 'ITBIS',
              rate: (val.rate * 100).toFixed(2),
              amount: taxAmount.toFixed(2),
            });
          }
        });

        const total = subtotal - totalDiscount + totalTaxes;

        // Insert new lines
        if (linesData.length > 0) {
          await tx.insert(quoteLines).values(
            linesData.map((line) => ({
              id: uuidv4(),
              quoteId,
              productId: line.productId,
              quantity: String(line.quantity),
              unitPrice: String(line.unitPrice),
              discount: String(line.discount),
              subtotal: String(line.lineSubtotal),
              total: String(line.lineTotal),
            }))
          );

          if (taxInserts.length > 0) {
            await tx.insert(quoteTaxes).values(
              taxInserts.map(t => ({
                id: uuidv4(),
                quoteId,
                taxType: t.taxType,
                rate: t.rate,
                amount: t.amount
              }))
            );
          }
        }

        // Update quote header
        await tx.update(quotes).set({
          warehouseId: data.warehouseId !== undefined ? data.warehouseId : quote.warehouseId,
          customerId: data.customerId !== undefined ? data.customerId : quote.customerId,
          notes: data.notes !== undefined ? data.notes : quote.notes,
          subtotal: subtotal.toFixed(2),
          discount: totalDiscount.toFixed(2),
          totalTaxes: totalTaxes.toFixed(2),
          total: total.toFixed(2),
          updatedAt: new Date()
        }).where(eq(quotes.id, quoteId));
        
      } else {
        // Just update header
        await tx.update(quotes).set({
          warehouseId: data.warehouseId !== undefined ? data.warehouseId : quote.warehouseId,
          customerId: data.customerId !== undefined ? data.customerId : quote.customerId,
          notes: data.notes !== undefined ? data.notes : quote.notes,
          updatedAt: new Date()
        }).where(eq(quotes.id, quoteId));
      }

      return { success: true };
    });
  }

  /**
   * Gets list of quotes
   */
  static async getQuotes(companyId: string, page = 1, limit = 50, status?: string) {
    const offset = (page - 1) * limit;
    
    let whereClause = eq(quotes.companyId, companyId);
    if (status) {
      whereClause = and(whereClause, eq(quotes.status, status)) as any;
    }

    const items = await db.select({
      id: quotes.id,
      companyId: quotes.companyId,
      warehouseId: quotes.warehouseId,
      customerId: quotes.customerId,
      userId: quotes.userId,
      sequenceNumber: quotes.sequenceNumber,
      status: quotes.status,
      subtotal: quotes.subtotal,
      discount: quotes.discount,
      totalTaxes: quotes.totalTaxes,
      total: quotes.total,
      notes: quotes.notes,
      validUntil: quotes.validUntil,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      customerName: customers.name,
    })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${quotes.createdAt} DESC`);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(quotes)
      .where(whereClause);

    // Calculate overall stats for all quotes (non-deleted) of the company
    const [statsResult] = await db.select({
      totalAmount: sql<string>`coalesce(sum(total), 0)`,
      pendingCount: sql<number>`count(case when status = 'pending' then 1 end)`
    })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), sql`deleted_at is null`));

    return {
      items,
      total: Number(count),
      page,
      totalPages: Math.ceil(Number(count) / limit),
      stats: {
        totalAmount: Number(statsResult?.totalAmount || 0),
        pendingCount: Number(statsResult?.pendingCount || 0)
      }
    };
  }

  /**
   * Convert Quote to Invoice
   * This simply returns a structured payload that can be fed into InvoiceService
   */
  static async prepareInvoicePayload(quoteId: string) {
    const quote = await this.getQuote(quoteId);
    if (!quote) throw new Error('Cotización no encontrada');
    
    return {
      companyId: quote.companyId,
      warehouseId: quote.warehouseId,
      customerId: quote.customerId,
      userId: quote.userId,
      notes: quote.notes,
      quoteId: quote.id,
      lines: quote.lines.map(line => {
        // We need to fetch the taxRate from quoteTaxes or reconstruct it
        // A simpler way for the frontend is to just fetch the full product data again, 
        // but we can map the basic info. Let's return the basic lines.
        return {
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount),
          // We don't store taxRate per line directly, so frontend might need to refetch it 
          // or we can compute it from unitPrice, subtotal and taxes.
        }
      })
    };
  }

  /**
   * Mark quote as invoiced
   */
  static async markAsInvoiced(quoteId: string) {
    await db.update(quotes)
      .set({ status: 'invoiced', updatedAt: new Date() })
      .where(eq(quotes.id, quoteId));
  }
}
