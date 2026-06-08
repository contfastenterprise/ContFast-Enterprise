import { db, chartOfAccounts, journalEntries, journalEntryLines } from '@/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface NewAccount {
  companyId: string;
  code: string;
  name: string;
  type: string; // asset | liability | equity | revenue | expense
  parentId?: string;
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface NewJournalEntry {
  companyId: string;
  date: string;
  reference?: string;
  description: string;
  lines: JournalLineInput[];
}

export class AccountingRepository {
  // ==========================================
  // CHART OF ACCOUNTS
  // ==========================================
  static async getChartOfAccounts(companyId: string) {
    return await db.select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        sql`${chartOfAccounts.deletedAt} IS NULL`
      ))
      .orderBy(chartOfAccounts.code);
  }

  static async createAccount(data: NewAccount) {
    // Check if code already exists
    const existing = await db.select().from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, data.companyId),
        eq(chartOfAccounts.code, data.code),
        sql`${chartOfAccounts.deletedAt} IS NULL`
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Ya existe una cuenta con este código en el catálogo.');
    }

    const [account] = await db.insert(chartOfAccounts).values({
      id: uuidv4(),
      companyId: data.companyId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      status: 'active',
    }).returning();

    return account;
  }

  // ==========================================
  // JOURNAL ENTRIES
  // ==========================================
  static async getJournalEntries(companyId: string, limit = 50) {
    const entries = await db.select()
      .from(journalEntries)
      .where(and(
        eq(journalEntries.companyId, companyId),
        sql`${journalEntries.deletedAt} IS NULL`
      ))
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit);

    // Fetch lines for these entries
    if (entries.length === 0) return [];

    const entryIds = entries.map(e => e.id);
    const lines = await db.select({
      id: journalEntryLines.id,
      journalEntryId: journalEntryLines.journalEntryId,
      accountId: journalEntryLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
    })
    .from(journalEntryLines)
    .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
    .where(sql`${journalEntryLines.journalEntryId} IN ${entryIds}`);

    // Attach lines to entries
    return entries.map(entry => {
      const entryLines = lines.filter(l => l.journalEntryId === entry.id);
      const totalDebit = entryLines.reduce((acc, l) => acc + parseFloat(l.debit as any), 0);
      const totalCredit = entryLines.reduce((acc, l) => acc + parseFloat(l.credit as any), 0);
      return {
        ...entry,
        lines: entryLines,
        totalDebit,
        totalCredit
      };
    });
  }

  static async createJournalEntry(data: NewJournalEntry) {
    // 1. Validate Double Entry Accounting (Debit == Credit)
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);

    // Use a small epsilon for float comparison
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`El asiento no cuadra. Total Débitos: ${totalDebit}, Total Créditos: ${totalCredit}`);
    }

    if (totalDebit === 0 && totalCredit === 0) {
      throw new Error('El asiento debe tener valores de débito o crédito.');
    }

    if (data.lines.length < 2) {
      throw new Error('Un asiento contable debe tener al menos dos líneas.');
    }

    // 2. Transaction wrapper for Atomicity
    return await db.transaction(async (tx) => {
      const entryId = uuidv4();

      // Create Entry
      const [entry] = await tx.insert(journalEntries).values({
        id: entryId,
        companyId: data.companyId,
        date: data.date,
        reference: data.reference || null,
        description: data.description,
        status: 'posted',
      }).returning();

      // Create Lines
      const linesToInsert = data.lines.map(line => ({
        id: uuidv4(),
        companyId: data.companyId,
        journalEntryId: entryId,
        accountId: line.accountId,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      }));

      const insertedLines = await tx.insert(journalEntryLines).values(linesToInsert).returning();

      return {
        ...entry,
        lines: insertedLines
      };
    });
  }
}
