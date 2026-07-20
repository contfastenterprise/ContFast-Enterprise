import { db } from '@/db';
import { accountsPayable, apPayments, checks, suppliers, chartOfAccounts, bankAccounts, cashSessions } from '@/db/schema';
import { eq, and, sql, desc, isNull, lte, gte, ilike, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CashRepository } from '@/repositories/cashRepository';

function formatLocalDate(date: Date | string): string;
function formatLocalDate(date: Date | string | undefined | null): string | undefined;
function formatLocalDate(date: Date | string | undefined | null): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUtcDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class ApRepository {
  /**
   * Find all accounts payable for a company, with supplier details.
   */
  static async findAll(companyId: string) {
    const results = await db.select({
      ap: accountsPayable,
      supplier: suppliers,
      ncf: sql<string>`(SELECT ncf FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
      issueDate: sql<string>`(SELECT issue_date FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
      paymentsSum: sql<string>`COALESCE((SELECT SUM(amount) FROM ap_payments WHERE ap_payments.ap_id = accounts_payable.id AND ap_payments.status = 'applied'), '0.00')`
    })
    .from(accountsPayable)
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .where(and(
      eq(accountsPayable.companyId, companyId),
      isNull(accountsPayable.deletedAt)
    ))
    .orderBy(desc(accountsPayable.dueDate));

    return results.map(r => {
      const balanceVal = parseFloat(r.ap.balance);
      const paymentsVal = parseFloat(r.paymentsSum);
      const computedOriginalAmount = balanceVal + paymentsVal;

      return {
        ...r.ap,
        amount: computedOriginalAmount.toString(),
        ncf: r.ncf,
        issueDate: formatUtcDateString(r.issueDate),
        supplierName: r.supplier.name,
        supplierRnc: r.supplier.rnc
      };
    });
  }

  /**
   * Find a specific accounts payable by ID.
   */
  static async findById(id: string, companyId: string) {
    const result = await db.select({
      ap: accountsPayable,
      supplier: suppliers,
      paymentsSum: sql<string>`COALESCE((SELECT SUM(amount) FROM ap_payments WHERE ap_payments.ap_id = accounts_payable.id AND ap_payments.status = 'applied'), '0.00')`
    })
    .from(accountsPayable)
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .where(and(
      eq(accountsPayable.id, id),
      eq(accountsPayable.companyId, companyId),
      isNull(accountsPayable.deletedAt)
    ))
    .limit(1);

    if (result.length === 0) return null;
    
    const balanceVal = parseFloat(result[0].ap.balance);
    const paymentsVal = parseFloat(result[0].paymentsSum);
    const computedOriginalAmount = balanceVal + paymentsVal;

    return {
      ...result[0].ap,
      amount: computedOriginalAmount.toString(),
      supplierName: result[0].supplier.name,
      supplierRnc: result[0].supplier.rnc
    };
  }

  /**
   * Registers a payment record in the database.
   */
  static async createPayment(tx: any, data: {
    companyId: string;
    apId: string;
    amount: number;
    paymentMethod: string;
    checkId?: string;
    debitAccountId: string;
    creditAccountId: string;
    paymentDate: Date | string;
    status: 'pending_guarantee' | 'applied' | 'voided';
  }) {
    const [payment] = await tx.insert(apPayments)
      .values({
        companyId: data.companyId,
        apId: data.apId,
        amount: data.amount.toString(),
        paymentMethod: data.paymentMethod,
        checkId: data.checkId,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        paymentDate: formatLocalDate(data.paymentDate),
        status: data.status,
      })
      .returning();
    return payment;
  }

  /**
   * Updates an accounts payable balance and status.
   */
  static async updateApBalance(tx: any, id: string, companyId: string, newBalance: number) {
    const status = newBalance <= 0.01 ? 'paid' : 'pending';
    const [updated] = await tx.update(accountsPayable)
      .set({
        balance: newBalance.toString(),
        status,
        updatedAt: new Date(),
      })
      .where(and(
        eq(accountsPayable.id, id),
        eq(accountsPayable.companyId, companyId)
      ))
      .returning();
    return updated;
  }

  /**
   * Registers a check in the database.
   */
  static async createCheck(tx: any, data: {
    companyId: string;
    bankAccountId: string;
    checkNumber: string;
    payee: string;
    amount: number;
    issueDate: Date | string;
    dueDate?: Date | string;
    isGuarantee: boolean;
    apId?: string;
    status: 'pending' | 'cleared' | 'voided';
  }) {
    const [check] = await tx.insert(checks)
      .values({
        companyId: data.companyId,
        bankAccountId: data.bankAccountId,
        checkNumber: data.checkNumber,
        payee: data.payee,
        amount: data.amount.toString(),
        issueDate: formatLocalDate(data.issueDate),
        dueDate: formatLocalDate(data.dueDate),
        isGuarantee: data.isGuarantee,
        apId: data.apId,
        status: data.status,
      })
      .returning();
    return check;
  }

  /**
   * Find payments for a company with pagination and filters.
   */
  static async getPayments(companyId: string, filters?: { 
    apId?: string, 
    startDate?: string, 
    endDate?: string, 
    search?: string, 
    limit?: number, 
    offset?: number 
  }) {
    const debitAccount = alias(chartOfAccounts, 'debit_account');
    const creditAccount = alias(chartOfAccounts, 'credit_account');

    let conditions: any[] = [
      eq(apPayments.companyId, companyId)
    ];
    if (filters?.apId) {
      conditions.push(eq(apPayments.apId, filters.apId));
    }
    if (filters?.startDate) {
      conditions.push(gte(apPayments.paymentDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(apPayments.paymentDate, filters.endDate));
    }
    if (filters?.search) {
      const searchStr = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(suppliers.name, searchStr),
          ilike(checks.checkNumber, searchStr)
        )
      );
    }

    const baseQuery = db.select({
      payment: apPayments,
      ap: accountsPayable,
      supplier: suppliers,
      debit: debitAccount,
      credit: creditAccount,
      check: checks
    })
    .from(apPayments)
    .innerJoin(accountsPayable, eq(apPayments.apId, accountsPayable.id))
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .innerJoin(debitAccount, eq(apPayments.debitAccountId, debitAccount.id))
    .innerJoin(creditAccount, eq(apPayments.creditAccountId, creditAccount.id))
    .leftJoin(checks, eq(apPayments.checkId, checks.id))
    .where(and(...conditions));

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(apPayments)
      .innerJoin(accountsPayable, eq(apPayments.apId, accountsPayable.id))
      .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .leftJoin(checks, eq(apPayments.checkId, checks.id))
      .where(and(...conditions));
    
    const total = Number(countResult[0]?.count || 0);

    // Apply pagination
    let finalQuery = baseQuery.orderBy(desc(apPayments.paymentDate)).$dynamic();
    
    if (filters?.limit !== undefined) {
      finalQuery = finalQuery.limit(filters.limit);
    }
    if (filters?.offset !== undefined) {
      finalQuery = finalQuery.offset(filters.offset);
    }

    const results = await finalQuery;
    
    const items = results.map(r => ({
      ...r.payment,
      paymentDate: formatUtcDateString(r.payment.paymentDate) || '',
      supplierName: r.supplier.name,
      debitAccountName: r.debit.name,
      debitAccountCode: r.debit.code,
      creditAccountName: r.credit.name,
      creditAccountCode: r.credit.code,
      checkNumber: r.check?.checkNumber,
      dueDate: formatUtcDateString(r.check?.dueDate) || undefined,
      checkStatus: r.check?.status,
      checkBankAccountId: r.check?.bankAccountId,
    }));

    return { items, total };
  }

  /**
   * Find all due guarantee checks that are pending.
   */
  static async findPendingGuaranteeChecks(companyId: string, beforeDate: Date = new Date()) {
    const formattedDate = beforeDate.toISOString().split('T')[0];
    return await db.select({
      check: checks,
      payment: apPayments,
      ap: accountsPayable,
      supplierName: suppliers.name
    })
    .from(checks)
    .innerJoin(apPayments, eq(apPayments.checkId, checks.id))
    .innerJoin(accountsPayable, eq(apPayments.apId, accountsPayable.id))
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .where(and(
      eq(checks.companyId, companyId),
      eq(checks.isGuarantee, true),
      eq(checks.status, 'pending'),
      eq(apPayments.status, 'pending_guarantee'),
      lte(checks.dueDate, formattedDate)
    ));
  }
}
