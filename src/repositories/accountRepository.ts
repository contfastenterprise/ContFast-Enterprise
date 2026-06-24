import { db, chartOfAccounts, journalEntries, journalEntryLines, accountsReceivable, accountsPayable } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

export interface CreateJournalEntryInput {
  companyId: string;
  reference?: string;
  date: Date | string;
  description: string;
  lines: {
    accountId: string;
    debit: number;
    credit: number;
  }[];
}

function formatLocalDate(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class AccountRepository {
  /**
   * Fetches account by code.
   */
  static async getAccountByCode(companyId: string, code: string) {
    const [account] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code), isNull(chartOfAccounts.deletedAt)))
      .limit(1);
    return account || null;
  }

  /**
   * Creates an accounting journal entry inside a transaction context.
   */
  static async createJournalEntry(tx: any, data: CreateJournalEntryInput) {
    // 1. Validate Double Entry balance (debits must equal credits!)
    const totalDebits = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = data.lines.reduce((sum, line) => sum + line.credit, 0);

    // Keep tolerance for decimal float inaccuracies
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Asiento contable descuadrado: Débitos ($${totalDebits.toFixed(2)}) no equivalen a Créditos ($${totalCredits.toFixed(2)}).`);
    }

    // 2. Insert Journal Entry Header
    const [entry] = await tx
      .insert(journalEntries)
      .values({
        companyId: data.companyId,
        reference: data.reference,
        date: formatLocalDate(data.date),
        description: data.description,
        status: 'posted',
      })
      .returning();

    // 3. Insert Journal Entry Lines
    await tx.insert(journalEntryLines).values(
      data.lines.map((line) => ({
        companyId: data.companyId,
        journalEntryId: entry.id,
        accountId: line.accountId,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      }))
    );

    return entry;
  }

  /**
   * Registers a customer account receivable balance.
   */
  static async createAccountsReceivable(tx: any, data: {
    companyId: string;
    customerId: string;
    invoiceId: string;
    amount: number;
    dueDate: Date | string;
  }) {
    const [ar] = await tx
      .insert(accountsReceivable)
      .values({
        companyId: data.companyId,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        amount: data.amount.toString(),
        balance: data.amount.toString(), // Initially fully outstanding
        dueDate: formatLocalDate(data.dueDate),
        status: 'pending',
      })
      .returning();
    return ar;
  }

  /**
   * Registers a supplier account payable balance.
   */
  static async createAccountsPayable(tx: any, data: {
    companyId: string;
    supplierId: string;
    amount: number;
    dueDate: Date | string;
  }) {
    const [ap] = await tx
      .insert(accountsPayable)
      .values({
        companyId: data.companyId,
        supplierId: data.supplierId,
        amount: data.amount.toString(),
        balance: data.amount.toString(),
        dueDate: formatLocalDate(data.dueDate),
        status: 'pending',
      })
      .returning();
    return ap;
  }

  /**
   * Fetches the chart of accounts for a company.
   */
  static async getChart(companyId: string) {
    return await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), isNull(chartOfAccounts.deletedAt)))
      .orderBy(chartOfAccounts.code);
  }
}
