// src/services/expenseService.ts
import { eq, and, between } from 'drizzle-orm';
import { db } from '../db';
import { expenses, chartOfAccounts } from '../db/schema';
import { accountsPayable } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { addStock } from './inventoryService';
import { AccountRepository } from '../repositories/accountRepository';
import { FinancialMovementService } from '@/services/financialMovementService';

async function getOrCreateAccount(tx: any, companyId: string, code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost') {
  const [acc] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));

  if (acc) return acc;

  const [newAcc] = await tx
    .insert(chartOfAccounts)
    .values({
      companyId,
      code,
      name,
      type,
      status: 'active',
    })
    .returning();

  return newAcc;
}

/**
 * Creates a new expense record and automatically creates a corresponding
 * entry in `accounts_payable`.
 */
export async function createExpense(expenseData: {
  companyId: string;
  warehouseId?: string;
  supplierId: string;
  expenseType: string; // '01'..'11'
  ncf: string;
  ncfModified?: string;
  issueDate: string; // YYYY-MM-DD
  paymentDate?: string;
  amount: number;
  itbis?: number;
  itbisRetained?: number;
  itbisProportionality?: number;
  isrRetained?: number;
  isc?: number;
  otherTaxes?: number;
  tip?: number;
  paymentMethod: string; // '01' cash, '02' cheque, etc.
  userId?: string; // Required if updating inventory
  lines?: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
  debitAccountId?: string;
}) {
  return await db.transaction(async (tx) => {
    // Insert expense
    const [expense] = await tx
      .insert(expenses)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        warehouseId: expenseData.warehouseId,
        supplierId: expenseData.supplierId,
        expenseType: expenseData.expenseType,
        ncf: expenseData.ncf,
        ncfModified: expenseData.ncfModified,
        issueDate: expenseData.issueDate,
        paymentDate: expenseData.paymentDate,
        amount: expenseData.amount.toString(),
        itbis: (expenseData.itbis ?? 0).toString(),
        itbisRetained: (expenseData.itbisRetained ?? 0).toString(),
        itbisProportionality: (expenseData.itbisProportionality ?? 0).toString(),
        isrRetained: (expenseData.isrRetained ?? 0).toString(),
        isc: (expenseData.isc ?? 0).toString(),
        otherTaxes: (expenseData.otherTaxes ?? 0).toString(),
        tip: (expenseData.tip ?? 0).toString(),
        paymentMethod: expenseData.paymentMethod,
      })
      .returning();

    // Automatic CXP entry
    const isCredit = expenseData.paymentMethod === '04';
    await tx
      .insert(accountsPayable)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        supplierId: expenseData.supplierId,
        amount: expenseData.amount.toString(),
        balance: isCredit ? expenseData.amount.toString() : '0.00',
        dueDate: expenseData.paymentDate ?? expenseData.issueDate,
        status: isCredit ? 'pending' : 'paid',
      });

    // Financial movements registration (Suplidores)
    if (expenseData.supplierId) {
      await FinancialMovementService.registerMovement(tx, {
        companyId: expenseData.companyId,
        entityType: 'supplier',
        supplierId: expenseData.supplierId,
        date: expenseData.issueDate,
        movementType: 'invoice',
        documentId: expense.id,
        documentNumber: expenseData.ncf || 'Sin NCF',
        originModule: 'purchases',
        debit: 0,
        credit: expenseData.amount,
        userId: expenseData.userId,
        notes: `Compra de bienes/servicios registrada. NCF: ${expenseData.ncf || 'Sin NCF'}`,
      });

      // Rule: If cash purchase, generate matching immediate payment movement
      if (!isCredit) {
        await FinancialMovementService.registerMovement(tx, {
          companyId: expenseData.companyId,
          entityType: 'supplier',
          supplierId: expenseData.supplierId,
          date: expenseData.issueDate,
          movementType: 'payment',
          documentId: expense.id,
          documentNumber: `PAG-CASH-${expenseData.ncf || expense.id.slice(0, 8)}`,
          originModule: expenseData.paymentMethod === '01' ? 'cash' : 'bank',
          debit: expenseData.amount,
          credit: 0,
          userId: expenseData.userId,
          notes: `Pago inmediato al contado. NCF: ${expenseData.ncf || 'Sin NCF'}`,
        });
      }
    }

    // --- Journal Entry Generation (Asiento Contable) ---
    const subtotal = expenseData.amount;
    const itbisAmount = expenseData.itbis ?? 0;
    const otherTaxesAmount = expenseData.otherTaxes ?? 0;
    const isrRet = expenseData.isrRetained ?? 0;
    const itbisRet = expenseData.itbisRetained ?? 0;

    // Total net: subtotal + itbis + otherTaxes - isrRet - itbisRet
    const netAmount = subtotal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;

    if (netAmount > 0) {
      // 1. Get/create accounts
      const hasInventory = !!(expenseData.warehouseId && expenseData.lines && expenseData.lines.length > 0);
      const accDebit = expenseData.debitAccountId
        ? { id: expenseData.debitAccountId }
        : (hasInventory 
          ? await getOrCreateAccount(tx, expenseData.companyId, '1.1.06', 'Inventario de Mercancía', 'asset')
          : await getOrCreateAccount(tx, expenseData.companyId, '5.1.01', 'Costo de Ventas', 'cost'));

      const accCredit = isCredit
        ? await getOrCreateAccount(tx, expenseData.companyId, '2.1.01', 'Cuentas por Pagar', 'liability')
        : await getOrCreateAccount(tx, expenseData.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');

      const journalLines = [
        // Debit the subtotal/cost
        { accountId: accDebit.id, debit: subtotal, credit: 0 },
      ];

      // Debit the ITBIS Pagado if any
      if (itbisAmount > 0) {
        const accItbisPagado = await getOrCreateAccount(tx, expenseData.companyId, '1.1.08', 'ITBIS Pagado en Compras', 'asset');
        journalLines.push({ accountId: accItbisPagado.id, debit: itbisAmount, credit: 0 });
      }

      // Debit other taxes if any
      if (otherTaxesAmount > 0) {
        const accOtrosImp = await getOrCreateAccount(tx, expenseData.companyId, '5.1.02', 'Otros Impuestos y Tasas', 'expense');
        journalLines.push({ accountId: accOtrosImp.id, debit: otherTaxesAmount, credit: 0 });
      }

      // Credit the net paid/payable
      journalLines.push({ accountId: accCredit.id, debit: 0, credit: netAmount });

      // Credit the Retained ISR if any
      if (isrRet > 0) {
        const accIsrRet = await getOrCreateAccount(tx, expenseData.companyId, '2.1.04', 'ISR Retenido por Pagar', 'liability');
        journalLines.push({ accountId: accIsrRet.id, debit: 0, credit: isrRet });
      }

      // Credit the Retained ITBIS if any
      if (itbisRet > 0) {
        const accItbisRet = await getOrCreateAccount(tx, expenseData.companyId, '2.1.05', 'ITBIS Retenido por Pagar', 'liability');
        journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: itbisRet });
      }

      // Create the journal entry
      await AccountRepository.createJournalEntry(tx, {
        companyId: expenseData.companyId,
        reference: expense.id,
        date: expenseData.issueDate,
        description: `Asiento Automático de Compra NCF: ${expenseData.ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'}`,
        lines: journalLines,
      });
    }

    // Update inventory if goods purchase
    if (expenseData.warehouseId && expenseData.lines && expenseData.userId) {
      // For expenseType '09' (Compras y Gastos que formarán parte del costo de venta) or similar
      for (const line of expenseData.lines) {
        await addStock(
          expenseData.companyId,
          line.productId,
          expenseData.warehouseId,
          line.quantity,
          expenseData.userId,
          'purchase',
          expense.id,
          `Compra según NCF ${expenseData.ncf}`,
          tx
        );
      }
    }

    return expense;
  });
}

/** Fetch expenses for a company within a month (YYYY-MM) */
export async function getExpenses(companyId: string, period: string) {
  const [year, month] = period.split('-');
  const start = `${year}-${month}-01`;
  const end = `${year}-${month}-31`;
  return await db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.companyId, companyId), between(expenses.issueDate, start, end))
    );
}

/** Generate the 606 TXT file content */
export async function generate606Txt(companyId: string, period: string) {
  const rows = await getExpenses(companyId, period);
  const lines = rows.map((e) => {
    const fields = [
      (e.ncf || '').padEnd(19, ' '),
      e.issueDate.replace(/-/g, ''),
      e.paymentMethod.padStart(2, '0'),
      Number(e.amount).toFixed(2).replace('.', ''),
      Number(e.itbis).toFixed(2).replace('.', ''),
      Number(e.itbisRetained).toFixed(2).replace('.', ''),
      Number(e.isrRetained).toFixed(2).replace('.', ''),
    ];
    return fields.join('');
  });
  const header = `606|${companyId}|${period}\n`;
  return header + lines.join('\n') + '\n';
}

