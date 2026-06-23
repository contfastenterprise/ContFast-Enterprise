import { db } from '@/db';
import { accountsPayable, apPayments, checks, suppliers, chartOfAccounts, bankAccounts, cashSessions } from '@/db/schema';
import { eq, and, sql, desc, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CashRepository } from '@/repositories/cashRepository';

function formatLocalDate(date: Date | string): string;
function formatLocalDate(date: Date | string | undefined | null): string | undefined;
function formatLocalDate(date: Date | string | undefined | null): string | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class ApRepository {
  /**
   * Find all accounts payable for a company, with supplier details.
   */
  static async findAll(companyId: string) {
    const results = await db.select({
      ap: accountsPayable,
      supplier: suppliers
    })
    .from(accountsPayable)
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .where(and(
      eq(accountsPayable.companyId, companyId),
      isNull(accountsPayable.deletedAt)
    ))
    .orderBy(desc(accountsPayable.dueDate));

    return results.map(r => ({
      ...r.ap,
      supplierName: r.supplier.name,
      supplierRnc: r.supplier.rnc
    }));
  }

  /**
   * Find a specific accounts payable by ID.
   */
  static async findById(id: string, companyId: string) {
    const result = await db.select({
      ap: accountsPayable,
      supplier: suppliers
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
    return {
      ...result[0].ap,
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
   * Find payments for a company.
   */
  static async getPayments(companyId: string, apId?: string) {
    const debitAccount = alias(chartOfAccounts, 'debit_account');
    const creditAccount = alias(chartOfAccounts, 'credit_account');

    let conditions = [
      eq(apPayments.companyId, companyId)
    ];
    if (apId) {
      conditions.push(eq(apPayments.apId, apId));
    }

    const query = db.select({
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
    .where(and(...conditions))
    .orderBy(desc(apPayments.paymentDate));

    const results = await query;
    return results.map(r => ({
      ...r.payment,
      supplierName: r.supplier.name,
      debitAccountName: r.debit.name,
      debitAccountCode: r.debit.code,
      creditAccountName: r.credit.name,
      creditAccountCode: r.credit.code,
      checkNumber: r.check?.checkNumber,
      dueDate: r.check?.dueDate,
      checkStatus: r.check?.status,
      checkBankAccountId: r.check?.bankAccountId,
    }));
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
