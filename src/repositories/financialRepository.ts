import { db, withTenantMode } from '@/db';
import { 
  financialMovements, invoices, expenses, accountsReceivable, accountsPayable,
  customerReceipts, customerReceiptApplied, apPayments, customers, suppliers, 
  invoiceLines, products, productCategories 
} from '@/db/schema';
import { eq, and, desc, asc, sql, lte, gte, ilike, or, notInArray } from 'drizzle-orm';

export interface StatementFilters {
  startDate?: string;
  endDate?: string;
  type?: string; // 'all' | 'credit' | 'cash'
  search?: string;
}

export class FinancialRepository {
  /**
   * Generates a detailed account statement and statistics for a customer.
   */
  static async getCustomerStatement(
    companyId: string,
    customerId: string,
    filters?: StatementFilters
  ) {
    const today = new Date().toISOString().split('T')[0];

    // 1. Fetch Customer Info
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1);

    if (!customer) throw new Error('Cliente no encontrado');

    // 2. Base query for movements
    const conditions = [
      eq(financialMovements.companyId, companyId),
      eq(financialMovements.customerId, customerId),
      eq(financialMovements.status, 'active')
    ];

    if (filters?.startDate) {
      conditions.push(gte(financialMovements.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(financialMovements.date, filters.endDate));
    }
    if (filters?.search) {
      const pattern = `%${filters.search.toLowerCase()}%`;
      const searchOr = or(
        ilike(financialMovements.documentNumber, pattern),
        ilike(financialMovements.notes, pattern)
      );
      if (searchOr) {
        conditions.push(searchOr);
      }
    }

    // Filter by cash or credit
    if (filters?.type === 'credit') {
      // For credit, exclude cash receipts that were immediate, or filter based on notes
      conditions.push(sql`financial_movements.notes NOT LIKE '%al contado%'`);
    } else if (filters?.type === 'cash') {
      conditions.push(sql`financial_movements.notes LIKE '%al contado%'`);
    }

    const movements = await db
      .select()
      .from(financialMovements)
      .where(and(...conditions))
      .orderBy(asc(financialMovements.date), asc(financialMovements.time), asc(financialMovements.createdAt));

    // 3. Overall Totals (ignore date filters to show real outstanding status)
    const [totalsResult] = await db
      .select({
        totalInvoiced: sql<string>`COALESCE(SUM(CASE WHEN movement_type IN ('invoice', 'debit_note') THEN debit ELSE 0 END), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'receipt' THEN credit ELSE 0 END), 0)`,
        totalCreditNotes: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'credit_note' THEN credit ELSE 0 END), 0)`,
        totalDebitNotes: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'debit_note' THEN debit ELSE 0 END), 0)`,
        totalRetentions: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'retention' THEN credit ELSE 0 END), 0)`,
        totalAdvances: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'advance' THEN credit ELSE 0 END), 0)`,
        currentBalance: sql<string>`COALESCE(SUM(debit - credit), 0)`,
      })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.customerId, customerId),
          eq(financialMovements.status, 'active')
        )
      );

    // 4. Pending Invoices from accounts_receivable
    const pendingInvoices = await db
      .select({
        id: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        ncf: invoices.ncf,
        codigoFactura: invoices.codigoFactura,
        amount: accountsReceivable.amount,
        balance: accountsReceivable.balance,
        dueDate: accountsReceivable.dueDate,
        status: accountsReceivable.status,
        createdAt: invoices.createdAt
      })
      .from(accountsReceivable)
      .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(
        and(
          eq(accountsReceivable.companyId, companyId),
          eq(accountsReceivable.customerId, customerId),
          sql`accounts_receivable.balance > 0`,
          sql`accounts_receivable.deleted_at IS NULL`
        )
      )
      .orderBy(asc(accountsReceivable.dueDate));

    // Calculate pending totals
    let totalPending = 0;
    let totalOverdue = 0;

    pendingInvoices.forEach(inv => {
      const balanceVal = parseFloat(inv.balance);
      totalPending += balanceVal;

      const due = new Date(inv.dueDate);
      const curr = new Date(today);
      if (due < curr) {
        totalOverdue += balanceVal;
      }
    });

    // 5. Antigüedad de saldos (Aging)
    let agingNotExpired = 0;
    let aging1to30 = 0;
    let aging31to60 = 0;
    let aging61to90 = 0;
    let agingOver90 = 0;

    pendingInvoices.forEach(inv => {
      const balanceVal = parseFloat(inv.balance);
      const due = new Date(inv.dueDate);
      const curr = new Date(today);
      const diffTime = curr.getTime() - due.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        agingNotExpired += balanceVal;
      } else if (diffDays <= 30) {
        aging1to30 += balanceVal;
      } else if (diffDays <= 60) {
        aging31to60 += balanceVal;
      } else if (diffDays <= 90) {
        aging61to90 += balanceVal;
      } else {
        agingOver90 += balanceVal;
      }
    });

    // 6. Last Purchase and Last Payment dates
    const [lastPurchase] = await db
      .select({ date: financialMovements.date })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.customerId, customerId),
          eq(financialMovements.movementType, 'invoice'),
          eq(financialMovements.status, 'active')
        )
      )
      .orderBy(desc(financialMovements.date), desc(financialMovements.createdAt))
      .limit(1);

    const [lastPayment] = await db
      .select({ date: financialMovements.date })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.customerId, customerId),
          eq(financialMovements.movementType, 'receipt'),
          eq(financialMovements.status, 'active')
        )
      )
      .orderBy(desc(financialMovements.date), desc(financialMovements.createdAt))
      .limit(1);

    // 7. Average Payment Days
    const avgDaysResult = await db.execute(sql`
      SELECT COALESCE(AVG(cr.date - inv.created_at::date), 0)::float as avg_days
      FROM customer_receipt_applied cra
      JOIN customer_receipts cr ON cra.receipt_id = cr.id
      JOIN accounts_receivable ar ON cra.ar_id = ar.id
      JOIN invoices inv ON ar.invoice_id = inv.id
      WHERE cr.company_id = ${companyId} AND cr.customer_id = ${customerId}
    `);
    
    // @ts-ignore
    const avgPaymentDays = Math.round(avgDaysResult[0]?.avg_days || 0);

    // 8. Stats & Counts
    const [invoiceCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.customerId, customerId),
          isNull(invoices.deletedAt),
          notInArray(invoices.ecfType, ['33', '34'])
        )
      );
    const invoiceCount = Number(invoiceCountResult?.count || 0);
    const totalInvoicedValue = parseFloat(totalsResult?.totalInvoiced || '0');
    const avgInvoiceAmount = invoiceCount > 0 ? totalInvoicedValue / invoiceCount : 0;

    // 9. Customer Age
    const customerAgeDays = Math.ceil((new Date().getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    // 10. Top Purchased Products
    const topProducts = await db
      .select({
        productId: invoiceLines.productId,
        name: products.name,
        quantity: sql<number>`SUM(${invoiceLines.quantity})::float`,
        total: sql<number>`SUM(${invoiceLines.total})::float`
      })
      .from(invoiceLines)
      .innerJoin(products, eq(invoiceLines.productId, products.id))
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.customerId, customerId),
          isNull(invoices.deletedAt)
        )
      )
      .groupBy(invoiceLines.productId, products.name)
      .orderBy(desc(sql`SUM(${invoiceLines.quantity})`))
      .limit(5);

    const creditLimit = parseFloat(customer.creditLimit || '0.00');
    const currentBalance = parseFloat(totalsResult?.currentBalance || '0');
    const creditAvailable = Math.max(0, creditLimit - currentBalance);

    return {
      customer,
      summary: {
        creditLimit,
        creditAvailable,
        currentBalance,
        totalInvoiced: totalInvoicedValue,
        totalPaid: parseFloat(totalsResult?.totalPaid || '0'),
        totalPending,
        totalOverdue,
        totalCreditNotes: parseFloat(totalsResult?.totalCreditNotes || '0'),
        totalDebitNotes: parseFloat(totalsResult?.totalDebitNotes || '0'),
        totalRetentions: parseFloat(totalsResult?.totalRetentions || '0'),
        totalAdvances: parseFloat(totalsResult?.totalAdvances || '0'),
        lastPurchaseDate: lastPurchase?.date || null,
        lastPaymentDate: lastPayment?.date || null,
        avgPaymentDays,
        customerAgeDays,
        invoiceCount,
        avgInvoiceAmount,
      },
      aging: {
        notExpired: agingNotExpired,
        overdue1to30: aging1to30,
        overdue31to60: aging31to60,
        overdue61to90: aging61to90,
        overdueOver90: agingOver90
      },
      movements: movements.map(m => ({
        ...m,
        debit: parseFloat(m.debit),
        credit: parseFloat(m.credit),
        balance: parseFloat(m.balance)
      })),
      pendingInvoices: pendingInvoices.map(inv => ({
        ...inv,
        amount: parseFloat(inv.amount),
        balance: parseFloat(inv.balance)
      })),
      topProducts
    };
  }

  /**
   * Generates a detailed account statement and statistics for a supplier.
   */
  static async getSupplierStatement(
    companyId: string,
    supplierId: string,
    filters?: StatementFilters
  ) {
    const today = new Date().toISOString().split('T')[0];

    // 1. Fetch Supplier Info
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)))
      .limit(1);

    if (!supplier) throw new Error('Suplidor no encontrado');

    // 2. Base query for movements
    const conditions = [
      eq(financialMovements.companyId, companyId),
      eq(financialMovements.supplierId, supplierId),
      eq(financialMovements.status, 'active')
    ];

    if (filters?.startDate) {
      conditions.push(gte(financialMovements.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(financialMovements.date, filters.endDate));
    }
    if (filters?.search) {
      const pattern = `%${filters.search.toLowerCase()}%`;
      const searchOr = or(
        ilike(financialMovements.documentNumber, pattern),
        ilike(financialMovements.notes, pattern)
      );
      if (searchOr) {
        conditions.push(searchOr);
      }
    }

    if (filters?.type === 'credit') {
      conditions.push(sql`financial_movements.notes NOT LIKE '%al contado%'`);
    } else if (filters?.type === 'cash') {
      conditions.push(sql`financial_movements.notes LIKE '%al contado%'`);
    }

    const movements = await db
      .select()
      .from(financialMovements)
      .where(and(...conditions))
      .orderBy(asc(financialMovements.date), asc(financialMovements.time), asc(financialMovements.createdAt));

    // 3. Overall Totals
    const [totalsResult] = await db
      .select({
        totalPurchased: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'invoice' THEN credit ELSE 0 END), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'payment' THEN debit ELSE 0 END), 0)`,
        totalCreditNotes: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'credit_note' THEN debit ELSE 0 END), 0)`,
        totalDebitNotes: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'debit_note' THEN credit ELSE 0 END), 0)`,
        totalRetentions: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'retention' THEN debit ELSE 0 END), 0)`,
        totalAdvances: sql<string>`COALESCE(SUM(CASE WHEN movement_type = 'advance' THEN debit ELSE 0 END), 0)`,
        currentBalance: sql<string>`COALESCE(SUM(credit - debit), 0)`, // AP is credit minus debit
      })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.supplierId, supplierId),
          eq(financialMovements.status, 'active')
        )
      );

    // 4. Pending accounts payable from accounts_payable
    const pendingBills = await db
      .select({
        id: accountsPayable.id,
        amount: accountsPayable.amount,
        balance: accountsPayable.balance,
        dueDate: accountsPayable.dueDate,
        status: accountsPayable.status,
        createdAt: accountsPayable.createdAt
      })
      .from(accountsPayable)
      .where(
        and(
          eq(accountsPayable.companyId, companyId),
          eq(accountsPayable.supplierId, supplierId),
          sql`accounts_payable.balance > 0`,
          sql`accounts_payable.deleted_at IS NULL`
        )
      )
      .orderBy(asc(accountsPayable.dueDate));

    // Calculate totals
    let totalPending = 0;
    let totalOverdue = 0;

    pendingBills.forEach(bill => {
      const balanceVal = parseFloat(bill.balance);
      totalPending += balanceVal;

      const due = new Date(bill.dueDate);
      const curr = new Date(today);
      if (due < curr) {
        totalOverdue += balanceVal;
      }
    });

    // 5. Antigüedad (Aging)
    let agingNotExpired = 0;
    let aging1to30 = 0;
    let aging31to60 = 0;
    let aging61to90 = 0;
    let agingOver90 = 0;

    pendingBills.forEach(bill => {
      const balanceVal = parseFloat(bill.balance);
      const due = new Date(bill.dueDate);
      const curr = new Date(today);
      const diffTime = curr.getTime() - due.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        agingNotExpired += balanceVal;
      } else if (diffDays <= 30) {
        aging1to30 += balanceVal;
      } else if (diffDays <= 60) {
        aging31to60 += balanceVal;
      } else if (diffDays <= 90) {
        aging61to90 += balanceVal;
      } else {
        agingOver90 += balanceVal;
      }
    });

    // 6. Last Purchase and Payment
    const [lastPurchase] = await db
      .select({ date: financialMovements.date })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.supplierId, supplierId),
          eq(financialMovements.movementType, 'invoice'),
          eq(financialMovements.status, 'active')
        )
      )
      .orderBy(desc(financialMovements.date), desc(financialMovements.createdAt))
      .limit(1);

    const [lastPayment] = await db
      .select({ date: financialMovements.date })
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.supplierId, supplierId),
          eq(financialMovements.movementType, 'payment'),
          eq(financialMovements.status, 'active')
        )
      )
      .orderBy(desc(financialMovements.date), desc(financialMovements.createdAt))
      .limit(1);

    // 7. Stats
    const [billsCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.companyId, companyId),
          eq(expenses.supplierId, supplierId),
          isNull(expenses.deletedAt)
        )
      );
    const billsCount = Number(billsCountResult?.count || 0);
    const totalPurchasedValue = parseFloat(totalsResult?.totalPurchased || '0');
    const avgBillAmount = billsCount > 0 ? totalPurchasedValue / billsCount : 0;

    return {
      supplier,
      summary: {
        currentBalance: parseFloat(totalsResult?.currentBalance || '0'),
        totalPurchased: totalPurchasedValue,
        totalPaid: parseFloat(totalsResult?.totalPaid || '0'),
        totalPending,
        totalOverdue,
        totalCreditNotes: parseFloat(totalsResult?.totalCreditNotes || '0'),
        totalDebitNotes: parseFloat(totalsResult?.totalDebitNotes || '0'),
        totalRetentions: parseFloat(totalsResult?.totalRetentions || '0'),
        totalAdvances: parseFloat(totalsResult?.totalAdvances || '0'),
        lastPurchaseDate: lastPurchase?.date || null,
        lastPaymentDate: lastPayment?.date || null,
        billsCount,
        avgBillAmount
      },
      aging: {
        notExpired: agingNotExpired,
        overdue1to30: aging1to30,
        overdue31to60: aging31to60,
        overdue61to90: aging61to90,
        overdueOver90: agingOver90
      },
      movements: movements.map(m => ({
        ...m,
        debit: parseFloat(m.debit),
        credit: parseFloat(m.credit),
        balance: parseFloat(m.balance)
      })),
      pendingBills: pendingBills.map(bill => ({
        ...bill,
        amount: parseFloat(bill.amount),
        balance: parseFloat(bill.balance)
      }))
    };
  }

  /**
   * Retrieves data for the financial statement dashboard.
   */
  static async getFinancialDashboard(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const today = new Date().toISOString().split('T')[0];

    // 1. Clientes con mayor deuda (Top debtors)
    const topDebtors = await db.execute(sql`
      SELECT c.id, c.name, c.rnc_cedula, 
             COALESCE(SUM(ar.balance), 0)::float as pending_balance,
             COALESCE(SUM(CASE WHEN ar.due_date < ${today} THEN ar.balance ELSE 0 END), 0)::float as overdue_balance
      FROM customers c
      JOIN accounts_receivable ar ON c.id = ar.customer_id
      WHERE c.company_id = ${companyId} AND ar.balance > 0 AND ar.deleted_at IS NULL AND c.deleted_at IS NULL AND ar.modo = ${modo}
      GROUP BY c.id, c.name, c.rnc_cedula
      ORDER BY pending_balance DESC
      LIMIT 5
    `);

    // 2. Clientes al día vs Clientes morosos (counts)
    const clientStatusCounts = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT CASE WHEN ar.due_date < ${today} THEN c.id END)::int as morosos_count,
        COUNT(DISTINCT CASE WHEN ar.due_date >= ${today} AND ar.balance > 0 THEN c.id END)::int as al_dia_count
      FROM customers c
      LEFT JOIN accounts_receivable ar ON c.id = ar.customer_id AND ar.balance > 0 AND ar.deleted_at IS NULL AND ar.modo = ${modo}
      WHERE c.company_id = ${companyId} AND c.deleted_at IS NULL
    `);

    // 3. Clientes con mayor volumen de compras (Top customers by invoiced total)
    const topVolCustomers = await db.execute(sql`
      SELECT c.id, c.name, c.rnc_cedula,
             COALESCE(SUM(inv.total), 0)::float as total_invoiced,
             COUNT(inv.id)::int as invoice_count
      FROM customers c
      JOIN invoices inv ON c.id = inv.customer_id
      WHERE c.company_id = ${companyId} AND inv.deleted_at IS NULL AND inv.status = 'accepted' AND inv.modo = ${modo}
      GROUP BY c.id, c.name, c.rnc_cedula
      ORDER BY total_invoiced DESC
      LIMIT 5
    `);

    // 4. Suplidores con mayor saldo pendiente (Top AP)
    const topCreditors = await db.execute(sql`
      SELECT s.id, s.name, s.rnc,
             COALESCE(SUM(ap.balance), 0)::float as pending_balance,
             COALESCE(SUM(CASE WHEN ap.due_date < ${today} THEN ap.balance ELSE 0 END), 0)::float as overdue_balance
      FROM suppliers s
      JOIN accounts_payable ap ON s.id = ap.supplier_id
      WHERE s.company_id = ${companyId} AND ap.balance > 0 AND ap.deleted_at IS NULL AND s.deleted_at IS NULL AND ap.modo = ${modo}
      GROUP BY s.id, s.name, s.rnc
      ORDER BY pending_balance DESC
      LIMIT 5
    `);

    // 5. Suplidores más utilizados (Top volumes purchased)
    const topVolSuppliers = await db.execute(sql`
      SELECT s.id, s.name, s.rnc,
             COALESCE(SUM(exp.amount), 0)::float as total_purchased,
             COUNT(exp.id)::int as purchase_count
      FROM suppliers s
      JOIN expenses exp ON s.id = exp.supplier_id
      WHERE s.company_id = ${companyId} AND exp.deleted_at IS NULL AND exp.modo = ${modo}
      GROUP BY s.id, s.name, s.rnc
      ORDER BY total_purchased DESC
      LIMIT 5
    `);

    // 6. Global summaries for CxC and CxP
    const [cxcSummary] = await db
      .select({
        totalPending: sql<string>`COALESCE(SUM(balance), 0)`,
        overdue: sql<string>`COALESCE(SUM(CASE WHEN due_date < ${today} THEN balance ELSE 0 END), 0)`
      })
      .from(accountsReceivable)
      .where(
        withTenantMode(
          accountsReceivable,
          ctx,
          sql`accounts_receivable.balance > 0`,
          isNull(accountsReceivable.deletedAt)
        )
      );

    const [cxpSummary] = await db
      .select({
        totalPending: sql<string>`COALESCE(SUM(balance), 0)`,
        overdue: sql<string>`COALESCE(SUM(CASE WHEN due_date < ${today} THEN balance ELSE 0 END), 0)`
      })
      .from(accountsPayable)
      .where(
        withTenantMode(
          accountsPayable,
          ctx,
          sql`accounts_payable.balance > 0`,
          isNull(accountsPayable.deletedAt)
        )
      );

    return {
      cxc: {
        totalPending: parseFloat(cxcSummary?.totalPending || '0'),
        totalOverdue: parseFloat(cxcSummary?.overdue || '0'),
        topDebtors: topDebtors || [],
        // @ts-ignore
        morososCount: clientStatusCounts[0]?.morosos_count || 0,
        // @ts-ignore
        alDiaCount: clientStatusCounts[0]?.al_dia_count || 0,
        topVolCustomers: topVolCustomers || []
      },
      cxp: {
        totalPending: parseFloat(cxpSummary?.totalPending || '0'),
        totalOverdue: parseFloat(cxpSummary?.overdue || '0'),
        topCreditors: topCreditors || [],
        topVolSuppliers: topVolSuppliers || []
      }
    };
  }
}

function isNull(col: any) {
  return sql`${col} IS NULL`;
}
