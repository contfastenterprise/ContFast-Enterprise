import { NextRequest, NextResponse } from 'next/server';
import { CODIGOS_EMITIBLES, TIPOS_COMPROBANTE } from '@/services/dgii/tiposComprobante';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, invoices, invoiceLines, invoiceTaxes } from '@/db';
import { sql, and, eq } from 'drizzle-orm';
import { siguienteCodigoFactura } from '@/services/invoice/codigoFactura';
import { InvoiceCalculator } from '@/services/invoice/invoiceCalculator';
import type { IssueInvoiceInput } from '@/services/invoice/types';

// Zod validation schema for saving a draft invoice
const saveDraftSchema = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  // Misma lista que la emision. Ver src/services/dgii/tiposComprobante.ts.
  ecfType: z.enum(CODIGOS_EMITIBLES),
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const body = await req.json();
    const result = saveDraftSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const data = result.data;

    // Auditoria P1-23 (2026-09-03): este bloque reimplementaba a mano el
    // mismo calculo que InvoiceCalculator.calculateTotalsAndRetentions (el
    // que usa la emision real), pero sin `roundMoney` en cada paso
    // intermedio y sin `taxCategory`. El redondeo hecho al final en vez de
    // por linea acumulaba diferencias de centavos entre lo que el
    // borrador mostraba y lo que la emision real calculaba despues --
    // recurrencia del problema "Totales/MontoExento" que el usuario ya
    // habia identificado antes. Se reutiliza el mismo calculador que usa
    // el flujo de emision real: misma funcion, mismo redondeo linea por
    // linea, mismo resultado.
    const calculatorInput: IssueInvoiceInput = {
      companyId: auth.companyId,
      modo: auth.modo,
      warehouseId: data.warehouseId,
      customerId: data.customerId,
      userId: auth.userId,
      ecfType: data.ecfType,
      paymentType: data.paymentType,
      bankName: data.bankName,
      transactionNumber: data.transactionNumber,
      buyerRnc: data.buyerRnc,
      buyerName: data.buyerName,
      notes: data.notes,
      modifiedNcf: data.modifiedNcf,
      modifiedInvoiceId: data.modifiedInvoiceId,
      quoteId: data.quoteId,
      // El borrador no acepta retenciones en su Zod schema (saveDraftSchema,
      // arriba) -- no cambia con este arreglo. `data.retentions` queda
      // `undefined`, y el calculador ya sabe tratar eso como "sin retencion".
      lines: data.lines,
    };
    const totals = InvoiceCalculator.calculateTotalsAndRetentions(calculatorInput);

    // Generate a short unique draft identifier that fits varchar(13)
    // Format: DFT + 10 digit timestamp mod
    const draftNcf = `DFT${(Date.now() % 10000000000).toString().padStart(10, '0')}`;


    // Save draft in a transaction
    const draftInvoice = await db.transaction(async (tx) => {
      // El numero se reserva DENTRO de la transaccion. Antes se contaba fuera y
      // sin filtrar `modo`, asi que un borrador de PRUEBA consumia un numero del
      // correlativo real. Ver src/services/invoice/codigoFactura.ts.
      const codigoFactura = await siguienteCodigoFactura(
        tx, auth.companyId, auth.modo, data.ecfType
      );
      const [invoice] = await tx
        .insert(invoices)
        .values({
          companyId: auth.companyId,
          modo: auth.modo,
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
          subtotal: totals.subtotal.toString(),
          discount: totals.totalDiscount.toString(),
          totalTaxes: totals.totalTaxes.toString(),
          total: totals.total.toString(),
          // Antes se dejaban en el 0.00 por defecto de la columna: sin
          // retenciones (el borrador no las admite) totalNet es igual a
          // total, no cero -- ya que estamos calculando con el mismo
          // InvoiceCalculator de la emision real, se guardan completos.
          totalRetained: totals.totalRetained.toString(),
          totalNet: totals.totalNet.toString(),
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
      if (totals.itemLines.length > 0) {
        await tx.insert(invoiceLines).values(
          totals.itemLines.map((line: any) => ({
            invoiceId: invoice.id,
            productId: line.productId,
            warehouseId: line.warehouseId || data.warehouseId,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discount: line.discount.toString(),
            subtotal: line.subtotal.toString(),
            // Igual que en InvoiceRepository.create: `total` de la LINEA es
            // el monto gravable, SIN el impuesto (el impuesto va aparte, en
            // invoice_taxes). Antes este borrador guardaba aqui la linea CON
            // impuesto incluido -- inconsistente con como la emision real
            // guarda el mismo campo.
            total: line.total.toString(),
            taxRate: line.taxRate != null ? line.taxRate.toString() : null,
            taxCategory: line.taxCategory ?? null,
          }))
        );
      }

      // Insert taxes
      if (totals.taxesList.length > 0) {
        await tx.insert(invoiceTaxes).values(
          totals.taxesList.map((tax: any) => ({
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
