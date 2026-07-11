import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { 
  db, 
  invoices, 
  quotes, 
  ecfSequences, 
  quoteSequences, 
  deliveryNotes, 
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
  financialMovements,
  checks,
  supplierPayments,
  supplierPaymentApplied
} from '@/db';
import { eq, and } from 'drizzle-orm';
import { delCache } from '@/infrastructure/redis';

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

    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { message: 'Acceso denegado. Solo el rol sistemas puede limpiar datos de prueba.' } },
        { status: 403 }
      );
    }

    console.log(`[Clear Sandbox] Executing full sandbox data purge for company ID: ${companyId} requested by systems user: ${session.userId}`);

    // 2. Run Database Purge inside a Transaction
    await db.transaction(async (tx) => {
      const mode = 'PRUEBA';
      const cond = (table: any) => and(eq(table.companyId, companyId), eq(table.modo, mode));

      // Order of deletion to avoid foreign key violations:
      
      // 1. Receipts application & payments
      await tx.delete(customerReceiptApplied).where(cond(customerReceiptApplied));
      await tx.delete(customerReceipts).where(cond(customerReceipts));
      await tx.delete(supplierPaymentApplied).where(cond(supplierPaymentApplied));
      await tx.delete(supplierPayments).where(cond(supplierPayments));
      await tx.delete(apPayments).where(cond(apPayments));
      
      // 2. Receivables, payables & checks
      await tx.delete(accountsReceivable).where(cond(accountsReceivable));
      await tx.delete(accountsPayable).where(cond(accountsPayable));
      await tx.delete(checks).where(cond(checks));

      // 3. Invoices, quotes, delivery notes & expenses
      await tx.delete(invoices).where(cond(invoices));
      await tx.delete(expenseLines).where(cond(expenseLines));
      await tx.delete(expenses).where(cond(expenses));
      await tx.delete(quotes).where(cond(quotes));
      await tx.delete(deliveryNotes).where(cond(deliveryNotes));

      // 4. Sequences
      await tx.delete(ecfSequences).where(cond(ecfSequences));
      await tx.delete(quoteSequences).where(cond(quoteSequences));

      // 5. Cash sessions & movements
      await tx.delete(cashMovements).where(cond(cashMovements));
      await tx.delete(cashSessions).where(cond(cashSessions));

      // 6. Bank transactions
      await tx.delete(bankTransactions).where(cond(bankTransactions));

      // 7. Inventory
      await tx.delete(inventoryMovements).where(cond(inventoryMovements));
      await tx.delete(inventoryTransfers).where(cond(inventoryTransfers));
      await tx.delete(inventoryLevels).where(cond(inventoryLevels));

      // 8. Payroll & HR
      await tx.delete(payrollDetails).where(cond(payrollDetails));
      await tx.delete(payrolls).where(cond(payrolls));
      await tx.delete(overtimeRecords).where(cond(overtimeRecords));

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
