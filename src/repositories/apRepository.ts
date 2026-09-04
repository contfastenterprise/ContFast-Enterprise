import { db, type DbTransaction } from '@/db';
import { accountsPayable, apPayments, checks, suppliers, chartOfAccounts, bankAccounts, cashSessions } from '@/db/schema';
import { eq, and, sql, desc, isNull, lte, gte, ilike, or, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CashRepository } from '@/repositories/cashRepository';

function formatLocalDate(date: Date | string): string;
function formatLocalDate(date: Date | string | undefined | null): string | undefined;
function formatLocalDate(date: Date | string | undefined | null): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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
  static async findAll(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const results = await db.select({
      ap: accountsPayable,
      supplier: suppliers,
      ncf: sql<string>`(SELECT ncf FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
      issueDate: sql<string>`(SELECT issue_date FROM expenses WHERE expenses.id = accounts_payable.id OR (expenses.supplier_id = accounts_payable.supplier_id AND expenses.amount = accounts_payable.amount AND expenses.company_id = accounts_payable.company_id AND expenses.deleted_at IS NULL) LIMIT 1)`,
      checkDueDate: sql<string>`(SELECT due_date FROM checks WHERE checks.ap_id = accounts_payable.id AND checks.is_guarantee = true AND checks.status = 'pending' LIMIT 1)`,
      paymentsSum: sql<string>`COALESCE((SELECT SUM(amount) FROM ap_payments WHERE ap_payments.ap_id = accounts_payable.id AND ap_payments.status = 'applied'), '0.00')`
    })
    .from(accountsPayable)
    .innerJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
    .where(and(
      eq(accountsPayable.companyId, companyId),
      eq(accountsPayable.modo, modo),
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
        checkDueDate: formatUtcDateString(r.checkDueDate),
        supplierName: r.supplier.name,
        supplierRnc: r.supplier.rnc
      };
    });
  }

  /**
   * Find a specific accounts payable by ID.
   */
  /**
   * `modo` obligatorio: `id` llega del cuerpo de la peticion (`input.apId`) y
   * NO es un ancla valida por si solo. Sin el entorno, mandar el id de una
   * cuenta por pagar de PRUEBA estando en PRODUCCION la resolvia, pasaba la
   * validacion de saldo y le colgaba un pago real.
   */
  static async findById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
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
      eq(accountsPayable.modo, modo),
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
  static async createPayment(tx: DbTransaction, data: {
    companyId: string;
    modo: 'PRODUCCION' | 'PRUEBA';
    apId: string;
    amount: number;
    paymentMethod: string;
    checkId?: string;
    debitAccountId: string;
    creditAccountId: string;
    paymentDate: Date | string;
    status: 'pending_guarantee' | 'applied' | 'voided';
    /** Auditoria P1-13 (2026-09-03), migracion 0049. Quien registra el pago. */
    createdBy?: string;
  }) {
    const [payment] = await tx.insert(apPayments)
      .values({
        companyId: data.companyId,
        modo: data.modo ?? 'PRODUCCION',
        apId: data.apId,
        amount: data.amount.toString(),
        paymentMethod: data.paymentMethod,
        checkId: data.checkId,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        paymentDate: formatLocalDate(data.paymentDate),
        status: data.status,
        createdBy: data.createdBy || null,
      })
      .returning();
    return payment;
  }

  /**
   * Updates an accounts payable balance and status.
   */
  /**
   * Bloquea la fila de una cuenta por pagar y devuelve su estado actual.
   *
   * Auditoria ARP-06 y ARP-13. El saldo se leia con `findById`, que consulta
   * sobre la conexion global `db` y NO sobre la transaccion, y sin bloqueo. Con
   * eso, dos pagos simultaneos de la deuda completa leian el mismo saldo,
   * pasaban los dos la validacion de tope y escribian los dos: se emitian dos
   * cheques por el importe total y la cuenta quedaba en cero, con el pasivo
   * rebajado el doble de lo que se debia.
   *
   * `SELECT ... FOR UPDATE` dentro de la transaccion serializa a los que
   * compiten por la misma cuenta: el segundo espera al primero y lee el saldo
   * ya rebajado. Es la misma tecnica que usa `allocateNextNcf`.
   *
   * Devuelve null si la cuenta no existe, no es de la empresa o esta borrada.
   */
  static async bloquearAp(
    tx: DbTransaction,
    id: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA'
  ) {
    const [ap] = await tx
      .select()
      .from(accountsPayable)
      .where(and(
        eq(accountsPayable.id, id),
        eq(accountsPayable.companyId, companyId),
        eq(accountsPayable.modo, modo),
        isNull(accountsPayable.deletedAt)
      ))
      .limit(1)
      .for('update');
    return ap || null;
  }

  /**
   * Marca un cheque como cobrado, pero SOLO si sigue pendiente.
   *
   * Auditoria ARP-13: las dos rutas que aplican cheques en garantia (la masiva
   * y la individual) leian los pendientes con la conexion global y no volvian a
   * comprobar el estado dentro de la transaccion. Dos ejecuciones a la vez
   * aplicaban el mismo cheque dos veces. El `where` sobre el estado hace que la
   * segunda no actualice ninguna fila, y el llamador puede saltarsela.
   *
   * Devuelve true si este proceso fue el que lo cobro.
   */
  static async marcarChequeCobrado(
    tx: DbTransaction,
    checkId: string,
    companyId: string,
    fechaCobro: string
  ): Promise<boolean> {
    const filas = await tx
      .update(checks)
      .set({ status: 'cleared', clearedDate: fechaCobro, updatedAt: new Date() })
      .where(and(
        eq(checks.id, checkId),
        eq(checks.companyId, companyId),
        eq(checks.status, 'pending')
      ))
      .returning({ id: checks.id });
    return filas.length > 0;
  }

  /**
   * Marca un pago como aplicado, pero SOLO si seguia pendiente de garantia.
   * Contraparte de `marcarChequeCobrado`; ver su nota.
   */
  static async marcarPagoAplicado(
    tx: DbTransaction,
    paymentId: string,
    companyId: string
  ): Promise<boolean> {
    const filas = await tx
      .update(apPayments)
      .set({ status: 'applied', updatedAt: new Date() })
      .where(and(
        eq(apPayments.id, paymentId),
        eq(apPayments.companyId, companyId),
        eq(apPayments.status, 'pending_guarantee')
      ))
      .returning({ id: apPayments.id });
    return filas.length > 0;
  }

  static async updateApBalance(tx: DbTransaction, id: string, companyId: string, newBalance: number) {
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
  static async createCheck(tx: DbTransaction, data: {
    companyId: string;
    modo: 'PRODUCCION' | 'PRUEBA';
    bankAccountId: string;
    checkNumber: string;
    payee: string;
    amount: number;
    issueDate: Date | string;
    dueDate?: Date | string;
    isGuarantee: boolean;
    apId?: string;
    status: 'pending' | 'cleared' | 'voided';
    /** Fecha real de cobro. Solo aplica cuando status === 'cleared'. */
    clearedDate?: Date | string;
  }) {
    const [check] = await tx.insert(checks)
      .values({
        companyId: data.companyId,
        modo: data.modo ?? 'PRODUCCION',
        bankAccountId: data.bankAccountId,
        checkNumber: data.checkNumber,
        payee: data.payee,
        amount: data.amount.toString(),
        issueDate: formatLocalDate(data.issueDate),
        dueDate: formatLocalDate(data.dueDate),
        isGuarantee: data.isGuarantee,
        apId: data.apId,
        status: data.status,
        clearedDate: data.status === 'cleared'
          ? formatLocalDate(data.clearedDate ?? new Date())
          : null,
      })
      .returning();
    return check;
  }

  /**
   * Find payments for a company with pagination and filters.
   *
   * `dateField` decide sobre que fecha aplica el rango startDate/endDate:
   *  - 'payment' (default): ap_payments.payment_date = fecha de EMISION del cheque.
   *  - 'cleared': checks.cleared_date = fecha REAL de cobro. Es la unica correcta para
   *    el historial de cheques en garantia, que son post-fechados: un cheque emitido
   *    en junio y cobrado en agosto nunca aparece si se filtra por payment_date.
   */
  static async getPayments(companyId: string, filters?: { 
    apId?: string, 
    startDate?: string, 
    endDate?: string, 
    search?: string, 
    limit?: number, 
    offset?: number,
    status?: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    dateField?: 'payment' | 'cleared'
  }) {
    const debitAccount = alias(chartOfAccounts, 'debit_account');
    const creditAccount = alias(chartOfAccounts, 'credit_account');

    let conditions: SQL[] = [
      eq(apPayments.companyId, companyId)
    ];
    if (filters?.modo) {
      conditions.push(eq(apPayments.modo, filters.modo));
    }
    if (filters?.status) {
      conditions.push(eq(apPayments.status, filters.status));
    }
    if (filters?.apId) {
      conditions.push(eq(apPayments.apId, filters.apId));
    }

    const dateField = filters?.dateField === 'cleared' ? 'cleared' : 'payment';
    if (filters?.startDate) {
      conditions.push(
        dateField === 'cleared'
          ? gte(checks.clearedDate, filters.startDate)
          : gte(apPayments.paymentDate, filters.startDate)
      );
    }
    if (filters?.endDate) {
      conditions.push(
        dateField === 'cleared'
          ? lte(checks.clearedDate, filters.endDate)
          : lte(apPayments.paymentDate, filters.endDate)
      );
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
    .leftJoin(debitAccount, eq(apPayments.debitAccountId, debitAccount.id))
    .leftJoin(creditAccount, eq(apPayments.creditAccountId, creditAccount.id))
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
      debitAccountName: r.debit?.name || 'N/A',
      debitAccountCode: r.debit?.code || 'N/A',
      creditAccountName: r.credit?.name || 'N/A',
      creditAccountCode: r.credit?.code || 'N/A',
      checkNumber: r.check?.checkNumber,
      dueDate: formatUtcDateString(r.check?.dueDate) || undefined,
      checkStatus: r.check?.status,
      checkBankAccountId: r.check?.bankAccountId,
      isGuarantee: r.check?.isGuarantee ?? false,
      // Fecha real de cobro (null mientras el cheque siga pendiente)
      clearedDate: formatUtcDateString(r.check?.clearedDate) || undefined,
    }));

    return { items, total };
  }

  /**
   * Find all due guarantee checks that are pending.
   */
  /**
   * Cheques en garantia todavia sin cobrar.
   *
   * Auditoria ARP-25: cuando llega `checkIds`, manda la LISTA y no el
   * vencimiento. Una persona con el estado de cuenta delante puede confirmar un
   * cheque que el banco pago antes de la fecha pactada; lo que no puede volver a
   * pasar es que un cheque se aplique solo por haber vencido.
   *
   * Sin lista, la consulta sigue sirviendo para LISTAR los vencidos. Listar es
   * informativo y no aplica nada.
   */
  static async findPendingGuaranteeChecks(
    companyId: string,
    beforeDate: Date | undefined,
    modo: 'PRODUCCION' | 'PRUEBA',
    checkIds?: string[]
  ) {
    const conditions: SQL[] = [
      eq(checks.companyId, companyId),
      eq(checks.isGuarantee, true),
      eq(checks.status, 'pending'),
      isNull(checks.deletedAt),
      eq(apPayments.status, 'pending_guarantee'),
      isNull(accountsPayable.deletedAt),
    ];

    if (checkIds && checkIds.length > 0) {
      conditions.push(inArray(checks.id, checkIds));
    } else {
      conditions.push(lte(checks.dueDate, (beforeDate ?? new Date()).toISOString().split('T')[0]));
    }

    // Aislamiento de entorno: nunca aplicar contablemente cheques de PRUEBA
    // estando en PRODUCCION (generarian asientos y movimientos bancarios reales).
    if (modo) {
      conditions.push(eq(checks.modo, modo));
      conditions.push(eq(apPayments.modo, modo));
      conditions.push(eq(accountsPayable.modo, modo));
    }

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
    .where(and(...conditions));
  }
}
