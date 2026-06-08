import { db, bankAccounts, bankTransactions, journalEntries, journalEntryLines, chartOfAccounts } from '@/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface CreateBankAccountInput {
  companyId: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  type: string;
  initialBalance: number;
}

export interface RegisterBankTransactionInput {
  companyId: string;
  bankAccountId: string;
  date: string;
  type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'fee';
  amount: number;
  reference?: string;
  description?: string;
  contraAccountId?: string; // The chart of account ID to offset the transaction
}

export class BankRepository {
  // Get all bank accounts with balances
  static async getBankAccounts(companyId: string) {
    return await db.select()
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.companyId, companyId),
        sql`${bankAccounts.deletedAt} IS NULL`
      ))
      .orderBy(bankAccounts.bankName);
  }

  // Create a new bank account
  static async createBankAccount(data: CreateBankAccountInput) {
    return await db.transaction(async (tx) => {
      const [account] = await tx.insert(bankAccounts).values({
        id: uuidv4(),
        companyId: data.companyId,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        currency: data.currency,
        type: data.type,
        balance: data.initialBalance.toString()
      }).returning();

      return account;
    });
  }

  // Get transactions for a specific account
  static async getBankTransactions(companyId: string, bankAccountId: string) {
    return await db.select()
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccountId, bankAccountId)
      ))
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt));
  }

  // Register a new transaction (and auto journal entry)
  static async registerTransaction(data: RegisterBankTransactionInput) {
    return await db.transaction(async (tx) => {
      // 1. Get the account to verify it exists and get its current balance
      const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, data.bankAccountId));
      if (!account) throw new Error('Cuenta bancaria no encontrada');

      const isIncoming = ['deposit', 'transfer_in'].includes(data.type);
      const isOutgoing = ['withdrawal', 'transfer_out', 'fee'].includes(data.type);

      const currentBalance = parseFloat(account.balance as any);
      
      // Update balance
      const newBalance = isIncoming ? currentBalance + data.amount : currentBalance - data.amount;

      // 2. Create the transaction record
      const txId = uuidv4();
      const [transaction] = await tx.insert(bankTransactions).values({
        id: txId,
        companyId: data.companyId,
        bankAccountId: data.bankAccountId,
        date: data.date,
        type: data.type,
        amount: data.amount.toString(),
        reference: data.reference,
        description: data.description,
        status: 'reconciled' // auto-reconcile for manual entries, though can be pending for integrations
      }).returning();

      // 3. Update account balance
      await tx.update(bankAccounts)
        .set({ balance: newBalance.toString() })
        .where(eq(bankAccounts.id, data.bankAccountId));

      // 4. Create Journal Entry if contra account is provided
      if (data.contraAccountId) {
        // Find the 'Banco' account in the chart of accounts for the debit/credit
        const assetAccounts = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, data.companyId), eq(chartOfAccounts.type, 'asset')));
        let bankChartAccount = assetAccounts.find(a => a.name.toLowerCase().includes('banco'))?.id;

        if (bankChartAccount) {
          const entryId = uuidv4();
          await tx.insert(journalEntries).values({
            id: entryId,
            companyId: data.companyId,
            date: data.date,
            reference: data.reference || txId.slice(0, 8),
            description: `Movimiento Bancario: ${data.description || data.type}`,
            status: 'posted'
          });

          const bankAccountLine = {
            id: uuidv4(),
            companyId: data.companyId,
            journalEntryId: entryId,
            accountId: bankChartAccount,
            debit: isIncoming ? data.amount.toString() : '0.00',
            credit: isOutgoing ? data.amount.toString() : '0.00'
          };

          const contraAccountLine = {
            id: uuidv4(),
            companyId: data.companyId,
            journalEntryId: entryId,
            accountId: data.contraAccountId,
            debit: isOutgoing ? data.amount.toString() : '0.00',
            credit: isIncoming ? data.amount.toString() : '0.00'
          };

          await tx.insert(journalEntryLines).values([bankAccountLine, contraAccountLine]);
        }
      }

      return transaction;
    });
  }
}
