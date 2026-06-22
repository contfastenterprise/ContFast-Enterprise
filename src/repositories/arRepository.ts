import { db, accountsReceivable, customers, invoices, customerReceipts, customerReceiptApplied, cashMovements, cashSessions, journalEntries, journalEntryLines, chartOfAccounts } from '@/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CashRepository } from '@/repositories/cashRepository';

export interface RegisterReceiptInput {
  companyId: string;
  customerId: string;
  userId: string;
  date: string;
  paymentMethod: string;
  amount: number;
  reference?: string;
  notes?: string;
  invoicesApplied: { arId: string; amountApplied: number }[];
}

export class ArRepository {
  // Get pending accounts receivable grouped by customer
  static async getPendingAR(companyId: string) {
    // We want to fetch all pending AR, join with customers and invoices
    const arList = await db.select({
      id: accountsReceivable.id,
      customerId: accountsReceivable.customerId,
      customerName: customers.name,
      invoiceId: accountsReceivable.invoiceId,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      amount: accountsReceivable.amount,
      balance: accountsReceivable.balance,
      dueDate: accountsReceivable.dueDate,
      status: accountsReceivable.status
    })
    .from(accountsReceivable)
    .innerJoin(customers, eq(accountsReceivable.customerId, customers.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      eq(accountsReceivable.companyId, companyId),
      sql`${accountsReceivable.balance} > 0`,
      sql`${accountsReceivable.deletedAt} IS NULL`
    ))
    .orderBy(accountsReceivable.dueDate);

    // Group by customer
    const grouped: Record<string, any> = {};
    for (const ar of arList) {
      if (!grouped[ar.customerId]) {
        grouped[ar.customerId] = {
          customerId: ar.customerId,
          customerName: ar.customerName,
          totalBalance: 0,
          invoices: []
        };
      }
      grouped[ar.customerId].totalBalance += parseFloat(ar.balance as any);
      grouped[ar.customerId].invoices.push({
        arId: ar.id,
        invoiceId: ar.invoiceId,
        invoiceNumber: ar.invoiceNumber || 'Sin NCF',
        codigoFactura: ar.codigoFactura || '',
        invoiceDate: ar.invoiceDate,
        amount: parseFloat(ar.amount as any),
        balance: parseFloat(ar.balance as any),
        dueDate: ar.dueDate,
        status: ar.status
      });
    }

    return Object.values(grouped);
  }

  // Register a payment receipt
  static async registerReceipt(data: RegisterReceiptInput) {
    return await db.transaction(async (tx) => {
      const receiptId = uuidv4();

      // 1. Create Receipt
      const [receipt] = await tx.insert(customerReceipts).values({
        id: receiptId,
        companyId: data.companyId,
        customerId: data.customerId,
        date: data.date,
        paymentMethod: data.paymentMethod,
        amount: data.amount.toString(),
        reference: data.reference || null,
        notes: data.notes || null
      }).returning();

      // 2. Apply payments to AR and update balance
      for (const applied of data.invoicesApplied) {
        if (applied.amountApplied <= 0) continue;

        await tx.insert(customerReceiptApplied).values({
          id: uuidv4(),
          receiptId,
          arId: applied.arId,
          amountApplied: applied.amountApplied.toString(),
        });

        // Update AR balance
        const [ar] = await tx.select().from(accountsReceivable).where(eq(accountsReceivable.id, applied.arId));
        if (ar) {
          const newBalance = parseFloat(ar.balance as any) - applied.amountApplied;
          await tx.update(accountsReceivable)
            .set({ 
              balance: newBalance.toString(),
              status: newBalance <= 0.01 ? 'paid' : 'pending'
            })
            .where(eq(accountsReceivable.id, applied.arId));
        }
      }

      // 3. Rule: If payment is 'cash', it goes to Petty Cash (Caja Chica)
      if (data.paymentMethod === 'cash') {
        // Find active cash session for this user/company
        const [session] = await tx.select()
          .from(cashSessions)
          .where(and(
            eq(cashSessions.companyId, data.companyId),
            eq(cashSessions.userId, data.userId),
            eq(cashSessions.status, 'open')
          ))
          .limit(1);

        if (!session) {
          throw new Error('No hay una sesión de caja abierta para registrar el efectivo. Abra caja primero.');
        }

        await CashRepository.addMovement(tx, {
          companyId: data.companyId,
          cashSessionId: session.id,
          type: 'cash_in',
          amount: data.amount,
          description: `Cobro a factura(s). Ref: ${data.reference || receiptId.slice(0,8)}`,
          reference: receiptId
        });
      }

      // 4. Create Journal Entry (Asiento Contable)
      const accCaja = await ArRepository.getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
      const accCxC = await ArRepository.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');

      const entryId = uuidv4();
      await tx.insert(journalEntries).values({
        id: entryId,
        companyId: data.companyId,
        date: data.date,
        reference: receiptId.slice(0, 8),
        description: `Recibo de Cobro - Cliente ID: ${data.customerId.slice(0,8)}`,
        status: 'posted'
      });

      await tx.insert(journalEntryLines).values([
        {
          id: uuidv4(),
          companyId: data.companyId,
          journalEntryId: entryId,
          accountId: accCaja.id,
          debit: data.amount.toString(),
          credit: '0.00'
        },
        {
          id: uuidv4(),
          companyId: data.companyId,
          journalEntryId: entryId,
          accountId: accCxC.id,
          debit: '0.00',
          credit: data.amount.toString()
        }
      ]);

      return receipt;
    });
  }

  // Get historical receipts for a company with optional filters
  static async getReceiptsList(companyId: string, filters?: { startDate?: string; endDate?: string; search?: string }) {
    const conditions = [
      eq(customerReceipts.companyId, companyId),
      sql`${customerReceipts.deletedAt} IS NULL`
    ];

    if (filters?.startDate) {
      conditions.push(sql`${customerReceipts.date} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${customerReceipts.date} <= ${filters.endDate}`);
    }
    if (filters?.search) {
      const searchPattern = `%${filters.search.toLowerCase()}%`;
      conditions.push(sql`(lower(${customers.name}) like ${searchPattern} or lower(${customerReceipts.reference}) like ${searchPattern} or lower(${customerReceipts.id}::text) like ${searchPattern})`);
    }

    return await db.select({
      id: customerReceipts.id,
      customerId: customerReceipts.customerId,
      customerName: customers.name,
      date: customerReceipts.date,
      paymentMethod: customerReceipts.paymentMethod,
      amount: customerReceipts.amount,
      reference: customerReceipts.reference,
      notes: customerReceipts.notes,
      createdAt: customerReceipts.createdAt
    })
    .from(customerReceipts)
    .innerJoin(customers, eq(customerReceipts.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(customerReceipts.createdAt));
  }

  // Get detailed information of a receipt and its applied invoices
  static async getReceiptDetails(companyId: string, receiptId: string) {
    const [receipt] = await db.select({
      id: customerReceipts.id,
      companyId: customerReceipts.companyId,
      customerId: customerReceipts.customerId,
      customerName: customers.name,
      customerRnc: customers.rncCedula,
      date: customerReceipts.date,
      paymentMethod: customerReceipts.paymentMethod,
      amount: customerReceipts.amount,
      reference: customerReceipts.reference,
      notes: customerReceipts.notes,
      createdAt: customerReceipts.createdAt
    })
    .from(customerReceipts)
    .innerJoin(customers, eq(customerReceipts.customerId, customers.id))
    .where(and(
      eq(customerReceipts.id, receiptId),
      eq(customerReceipts.companyId, companyId),
      sql`${customerReceipts.deletedAt} IS NULL`
    ))
    .limit(1);

    if (!receipt) return null;

    const appliedInvoices = await db.select({
      appliedId: customerReceiptApplied.id,
      amountApplied: customerReceiptApplied.amountApplied,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      totalAmount: invoices.total,
      remainingBalance: accountsReceivable.balance
    })
    .from(customerReceiptApplied)
    .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(eq(customerReceiptApplied.receiptId, receiptId));

    // Get customer's overall remaining pending balance
    const [balanceResult] = await db.select({
      totalPending: sql<string>`coalesce(sum(${accountsReceivable.balance}), 0)`
    })
    .from(accountsReceivable)
    .where(and(
      eq(accountsReceivable.customerId, receipt.customerId),
      sql`${accountsReceivable.deletedAt} IS NULL`
    ));

    const customerTotalBalance = parseFloat(balanceResult?.totalPending || '0');

    return {
      ...receipt,
      appliedInvoices: appliedInvoices.map(ai => ({
        ...ai,
        amountApplied: parseFloat(ai.amountApplied as any),
        totalAmount: parseFloat(ai.totalAmount as any),
        remainingBalance: parseFloat(ai.remainingBalance as any),
        codigoFactura: ai.codigoFactura || undefined
      })),
      amount: parseFloat(receipt.amount as any),
      customerTotalBalance
    };
  }

  // Get detailed receipts breakdown for a customer (all payments applied to invoices)
  static async getCustomerReceiptsBreakdown(companyId: string, customerId: string) {
    const applications = await db.select({
      receiptId: customerReceipts.id,
      receiptDate: customerReceipts.date,
      receiptAmount: customerReceipts.amount,
      paymentMethod: customerReceipts.paymentMethod,
      reference: customerReceipts.reference,
      appliedId: customerReceiptApplied.id,
      amountApplied: customerReceiptApplied.amountApplied,
      createdAt: customerReceiptApplied.createdAt,
      invoiceId: accountsReceivable.invoiceId,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      invoiceTotal: invoices.total,
      currentBalance: accountsReceivable.balance
    })
    .from(customerReceiptApplied)
    .innerJoin(customerReceipts, eq(customerReceiptApplied.receiptId, customerReceipts.id))
    .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      eq(customerReceipts.companyId, companyId),
      eq(customerReceipts.customerId, customerId),
      sql`${customerReceipts.deletedAt} IS NULL`
    ))
    .orderBy(desc(customerReceipts.date), desc(customerReceiptApplied.createdAt));

    return applications.map(app => ({
      ...app,
      receiptAmount: parseFloat(app.receiptAmount as any),
      amountApplied: parseFloat(app.amountApplied as any),
      invoiceTotal: parseFloat(app.invoiceTotal as any),
      currentBalance: parseFloat(app.currentBalance as any)
    }));
  }

  private static async getOrCreateAccount(tx: any, companyId: string, code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense') {
    const [acc] = await tx
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.code, code), eq(chartOfAccounts.companyId, companyId)));

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
}
