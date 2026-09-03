import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { 
  db, 
  invoices, 
  invoiceLines, 
  invoiceTaxes, 
  invoiceRetentions, 
  creditDebitNotes, 
  dgiiSubmissions, 
  quotes, 
  quoteLines, 
  quoteTaxes, 
  ecfSequences, 
  quoteSequences, 
  deliveryNotes, 
  deliveryNoteLines, 
  journalEntries, 
  journalEntryLines, 
  accountsReceivable, 
  accountsPayable, 
  customerReceipts, 
  customerReceiptApplied, 
  apPayments, 
  expenses,
  expenseLines,
  cashMovements, 
  cashSessions, 
  bankTransactions, 
  inventoryMovements, 
  inventoryTransfers, 
  inventoryLevels, 
  payrollDetails, 
  payrolls, 
  overtimeRecords, 
  employeeIncome,
  employeeDeductions,
  employeeVacations,
  employeeLeaves,
  employeeSettlements,
  financialMovements,
  checks,
  supplierPayments,
  supplierPaymentApplied
} from '@/db';
import { eq, and, inArray } from 'drizzle-orm';
import { delCache } from '@/infrastructure/redis';
import { esSistemas } from '@/utils/rolMatch';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const companyId = resolvedParams.id;

    // 1. Verify Authentication & Role
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria P0-01 (2026-09-03): 'sistemas' es un rol ESTANDAR de cada
    // empresa cliente, no un rol de plataforma -- esto purga en bloque los
    // datos de sandbox de la empresa que diga companyId en la URL. Ver
    // utils/rolMatch.ts y drizzle/0048_staff_de_plataforma.sql.
    if (!esSistemas(session.role) || !session.isPlatformStaff) {
      return NextResponse.json(
        { success: false, error: { message: 'Acceso denegado. Solo el staff de plataforma puede limpiar datos de prueba.' } },
        { status: 403 }
      );
    }

    console.log(`[Clear Sandbox] Executing full sandbox data purge for company ID: ${companyId} requested by systems user: ${session.userId}`);

    // 2. Run Database Purge inside a Transaction
    await db.transaction(async (tx) => {
      const mode = 'PRUEBA';
      const cond = (table: any) => and(eq(table.companyId, companyId), eq(table.modo, mode));

      // Order of deletion to avoid foreign key violations:
      
      // 1. Fetch sandbox receipts, supplier payments, and expenses to clean junction tables first
      const sandboxReceipts = await tx
        .select({ id: customerReceipts.id })
        .from(customerReceipts)
        .where(cond(customerReceipts));
      const receiptIds = sandboxReceipts.map((r: any) => r.id);
      if (receiptIds.length > 0) {
        await tx.delete(customerReceiptApplied).where(inArray(customerReceiptApplied.receiptId, receiptIds));
      }

      const sandboxSupplierPayments = await tx
        .select({ id: supplierPayments.id })
        .from(supplierPayments)
        .where(cond(supplierPayments));
      const supplierPaymentIds = sandboxSupplierPayments.map((sp: any) => sp.id);
      if (supplierPaymentIds.length > 0) {
        await tx.delete(supplierPaymentApplied).where(inArray(supplierPaymentApplied.paymentId, supplierPaymentIds));
      }

      const sandboxExpenses = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(cond(expenses));
      const expenseIds = sandboxExpenses.map((e: any) => e.id);
      if (expenseIds.length > 0) {
        await tx.delete(expenseLines).where(inArray(expenseLines.expenseId, expenseIds));
      }

      // Auditoria P1-18 (2026-09-03): a esta funcion le faltaban por completo
      // las tablas hijas de invoices/quotes/delivery_notes -- invoice_lines,
      // invoice_taxes, invoice_retentions, quote_lines, quote_taxes y
      // delivery_note_lines ni siquiera se importaban. Las FK son
      // `ON DELETE no action`, asi que "limpiar sandbox" fallaba siempre que
      // hubiera facturas de PRUEBA con lineas -- practicamente todas. Se
      // resuelve igual que ya se hace arriba con receipts/supplier
      // payments/expenses: se obtienen los ids del padre y se borran las
      // hijas por ese id, ANTES de tocar al padre.
      const sandboxInvoices = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(cond(invoices));
      const invoiceIds = sandboxInvoices.map((i: any) => i.id);
      if (invoiceIds.length > 0) {
        await tx.delete(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceIds));
        await tx.delete(invoiceTaxes).where(inArray(invoiceTaxes.invoiceId, invoiceIds));
        await tx.delete(invoiceRetentions).where(inArray(invoiceRetentions.invoiceId, invoiceIds));
      }

      const sandboxQuotesForLines = await tx
        .select({ id: quotes.id })
        .from(quotes)
        .where(cond(quotes));
      const quoteIds = sandboxQuotesForLines.map((q: any) => q.id);
      if (quoteIds.length > 0) {
        await tx.delete(quoteLines).where(inArray(quoteLines.quoteId, quoteIds));
        await tx.delete(quoteTaxes).where(inArray(quoteTaxes.quoteId, quoteIds));
      }

      const sandboxDeliveryNotes = await tx
        .select({ id: deliveryNotes.id })
        .from(deliveryNotes)
        .where(cond(deliveryNotes));
      const deliveryNoteIds = sandboxDeliveryNotes.map((d: any) => d.id);
      if (deliveryNoteIds.length > 0) {
        await tx.delete(deliveryNoteLines).where(inArray(deliveryNoteLines.deliveryNoteId, deliveryNoteIds));
      }

      // 2. Receipts, supplier payments & AP payments
      await tx.delete(customerReceipts).where(cond(customerReceipts));
      await tx.delete(supplierPayments).where(cond(supplierPayments));
      await tx.delete(apPayments).where(cond(apPayments));
      
      // 3. Receivables, payables & checks
      await tx.delete(accountsReceivable).where(cond(accountsReceivable));
      await tx.delete(accountsPayable).where(cond(accountsPayable));
      await tx.delete(checks).where(cond(checks));

      // 4. Tablas que referencian a invoices y SI tienen su propio
      // companyId+modo (creditDebitNotes, dgiiSubmissions, deliveryNotes,
      // cashMovements) -- deben borrarse ANTES que invoices. deliveryNotes
      // en particular tiene su propia FK notNull a invoices: borrarla
      // despues, como se hacia antes, fallaba en cuanto existia un conduce.
      await tx.delete(creditDebitNotes).where(cond(creditDebitNotes));
      await tx.delete(dgiiSubmissions).where(cond(dgiiSubmissions));
      await tx.delete(cashMovements).where(cond(cashMovements));
      await tx.delete(deliveryNotes).where(cond(deliveryNotes));

      // 4b. Invoices, expenses & quotes -- ya sin ninguna hija pendiente.
      await tx.delete(invoices).where(cond(invoices));
      await tx.delete(expenses).where(cond(expenses));
      await tx.delete(quotes).where(cond(quotes));

      // 4. Sequences
      await tx.delete(ecfSequences).where(cond(ecfSequences));
      await tx.delete(quoteSequences).where(cond(quoteSequences));

      // 5. Cash sessions (los movimientos ya se borraron en el paso 4, antes
      // que las facturas que podian referenciar -- ver el comentario de ahi).
      await tx.delete(cashSessions).where(cond(cashSessions));

      // 6. Bank transactions
      await tx.delete(bankTransactions).where(cond(bankTransactions));

      // 7. Inventory
      await tx.delete(inventoryMovements).where(cond(inventoryMovements));
      await tx.delete(inventoryTransfers).where(cond(inventoryTransfers));
      await tx.delete(inventoryLevels).where(cond(inventoryLevels));

      // 8. Payroll & HR
      //
      // Auditoria: aqui solo se limpiaban nominas y horas extra. Faltaban las
      // otras cinco tablas de RRHH que llevan `modo`. Mientras hrRepository
      // ignoraba la columna nada de esto llegaba a PRUEBA y el hueco no se
      // notaba; ahora que RRHH escribe en el modo correcto, si.
      //
      // Los empleados, departamentos, cargos, tramos de ISR y la configuracion
      // de nomina NO se borran: son catalogo compartido entre los dos modos,
      // igual que productos, clientes y almacenes.
      await tx.delete(payrollDetails).where(cond(payrollDetails));
      await tx.delete(payrolls).where(cond(payrolls));
      await tx.delete(overtimeRecords).where(cond(overtimeRecords));
      await tx.delete(employeeIncome).where(cond(employeeIncome));
      await tx.delete(employeeDeductions).where(cond(employeeDeductions));
      await tx.delete(employeeSettlements).where(cond(employeeSettlements));
      await tx.delete(employeeLeaves).where(cond(employeeLeaves));
      await tx.delete(employeeVacations).where(cond(employeeVacations));

      // 9. Accounting entries
      await tx.delete(financialMovements).where(cond(financialMovements));
      await tx.delete(journalEntryLines).where(cond(journalEntryLines));
      await tx.delete(journalEntries).where(cond(journalEntries));
    });

    // 3. Clear company settings and dashboard caches
    try {
      await delCache(`company_settings:${companyId}`);
      console.log(`[Clear Sandbox] Invalidated cache for company: ${companyId}`);
    } catch (e) {
      console.error('[Clear Sandbox] Failed to invalidate cache:', e);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Todos los datos de prueba de la empresa han sido eliminados de forma exitosa.' 
    });

  } catch (err: any) {
    console.error('[Clear Sandbox] Error purging sandbox data:', err);
    return NextResponse.json(
      { success: false, error: { message: err.message || 'Error del servidor al limpiar datos.' } }, 
      { status: 500 }
    );
  }
}
