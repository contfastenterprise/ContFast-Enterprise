// src/services/expenseService.ts
import { eq, and, between } from 'drizzle-orm';
import { db } from '../db';
import { expenses } from '../db/schema';
import { accountsPayable } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { addStock } from './inventoryService';

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
      e.ncf.padEnd(19, ' '),
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

