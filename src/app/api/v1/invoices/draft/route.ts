import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, invoiceLines, invoiceTaxes } from '@/db';
import { sql, and, eq } from 'drizzle-orm';

// Zod validation schema for saving a draft invoice
const saveDraftSchema = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  ecfType: z.enum(['31', '32', '33', '34', '45']),
  paymentType: z.enum(['cash', 'credit', 'bank_transfer']),
  bankName: z.string().optional(),
  transactionNumber: z.string().optional(),
  notes: z.string().optional(),
  modifiedNcf: z.string().optional(),
  modifiedInvoiceId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  buyerRnc: z.string().optional(),
  buyerName: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discount: z.number().nonnegative().default(0),
      taxRate: z.number().nonnegative().default(0.18),
      warehouseId: z.string().uuid().optional(),
    })
  ).min(1, 'La factura debe tener al menos una línea de producto'),
});

/**
 * POST /api/v1/invoices/draft - Save an invoice as a local draft (no NCF, no DGII submission)
 */
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const result = saveDraftSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const data = result.data;

    // Calculate totals
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxes = 0;
    const taxSummaryMap: Record<string, { rate: number; amount: number }> = {};
    const itemLines: any[] = [];

    data.lines.forEach((line) => {
      const lineSubtotal = line.quantity * line.unitPrice;
      const lineDiscount = line.quantity * line.discount;
      const lineTaxableAmount = lineSubtotal - lineDiscount;
      const lineTaxAmount = lineTaxableAmount * line.taxRate;
      const lineTotal = lineTaxableAmount + lineTaxAmount;

      subtotal += lineSubtotal;
      totalDiscount += lineDiscount;
      totalTaxes += lineTaxAmount;

      itemLines.push({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        subtotal: lineSubtotal,
        total: lineTotal,
        warehouseId: line.warehouseId || data.warehouseId,
      });

      const taxKey = `ITBIS_${(line.taxRate * 100).toFixed(0)}%`;
      if (!taxSummaryMap[taxKey]) {
        taxSummaryMap[taxKey] = { rate: line.taxRate * 100, amount: 0 };
      }
      taxSummaryMap[taxKey].amount += lineTaxAmount;
    });

    const total = subtotal - totalDiscount + totalTaxes;
    const taxesList = Object.entries(taxSummaryMap).map(([, val]) => ({
      taxType: 'ITBIS',
      rate: val.rate,
      amount: val.amount,
    }));

    // Generate a short unique draft identifier that fits varchar(13)
    // Format: DFT + 10 digit timestamp mod
    const draftNcf = `DFT${(Date.now() % 10000000000).toString().padStart(10, '0')}`;


    // Generate codigoFactura for draft
    const year = new Date().getFullYear();
    const docPrefix = data.ecfType === '34' ? 'NC' : data.ecfType === '33' ? 'ND' : 'FAC';
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, auth.companyId),
          sql`codigo_factura LIKE ${docPrefix + '-' + year + '-%'}`
        )
      );
    const nextNum = Number(countResult?.count || 0) + 1;
    const codigoFactura = `${docPrefix}-${year}-${nextNum.toString().padStart(6, '0')}`;

    // Save draft in a transaction
    const draftInvoice = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(invoices)
        .values({
          companyId: auth.companyId,
          warehouseId: data.warehouseId,
          customerId: data.customerId,
          userId: auth.userId,
          cashSessionId: undefined,
          ncf: draftNcf,
          ecfType: data.ecfType,
          status: 'draft',
          paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
          paymentType: data.paymentType,
          bankName: data.bankName,
          transactionNumber: data.transactionNumber,
          subtotal: subtotal.toString(),
          discount: totalDiscount.toString(),
          totalTaxes: totalTaxes.toString(),
          total: total.toString(),
          buyerRnc: data.buyerRnc,
          buyerName: data.buyerName,
          notes: data.notes,
          modifiedNcf: data.modifiedNcf,
          modifiedInvoiceId: data.modifiedInvoiceId,
          codigoFactura,
          quoteId: data.quoteId,
        })
        .returning();

      // Insert lines
      if (itemLines.length > 0) {
        await tx.insert(invoiceLines).values(
          itemLines.map((line) => ({
            invoiceId: invoice.id,
            productId: line.productId,
            warehouseId: line.warehouseId,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discount: line.discount.toString(),
            subtotal: line.subtotal.toString(),
            total: line.total.toString(),
          }))
        );
      }

      // Insert taxes
      if (taxesList.length > 0) {
        await tx.insert(invoiceTaxes).values(
          taxesList.map((tax) => ({
            invoiceId: invoice.id,
            taxType: tax.taxType,
            rate: tax.rate.toString(),
            amount: tax.amount.toString(),
          }))
        );
      }

      return invoice;
    });

    return NextResponse.json(
      { success: true, data: draftInvoice },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/invoices/draft:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
