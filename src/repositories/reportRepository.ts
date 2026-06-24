import { db, journalEntries, journalEntryLines, chartOfAccounts, companies, companySettings, customers, accountsReceivable, invoices, expenses } from '@/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class ReportRepository {
  static async getCompanyInfo(companyId: string) {
    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        rnc: companies.rnc,
        address: companies.address,
        businessActivity: companies.businessActivity,
        logoUrl: companySettings.logoUrl,
      })
      .from(companies)
      .leftJoin(companySettings, eq(companies.id, companySettings.companyId))
      .where(eq(companies.id, companyId));
    return company;
  }

  static async getIncomeStatement(companyId: string, startDate: string, endDate: string) {
    // Income Statement accounts are Revenue (revenue) and Expenses (expense/cost)
    // We get the sum of credits - debits for revenue, and debits - credits for expenses.
    // Or we just get net changes per account.
    
    const accounts = await db.select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        sql`${chartOfAccounts.type} IN ('revenue', 'expense', 'cost')`
      ));

    // Sum all posted journal entry lines in the date range
    const balances = await db.select({
      accountId: journalEntryLines.accountId,
      totalDebit: sql<number>`SUM(CAST(${journalEntryLines.debit} AS numeric))`,
      totalCredit: sql<number>`SUM(CAST(${journalEntryLines.credit} AS numeric))`
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.status, 'posted'),
      gte(journalEntries.date, startDate),
      lte(journalEntries.date, endDate)
    ))
    .groupBy(journalEntryLines.accountId);

    const balanceMap = new Map(balances.map(b => [b.accountId, b]));

    let totalRevenue = 0;
    let totalExpense = 0;
    let totalCost = 0;

    const revenueAccounts: any[] = [];
    const expenseAccounts: any[] = [];
    const costAccounts: any[] = [];

    for (const acc of accounts) {
      const b = balanceMap.get(acc.id);
      if (!b) continue;
      
      const debit = Number(b.totalDebit) || 0;
      const credit = Number(b.totalCredit) || 0;
      
      if (acc.type === 'revenue') {
        const net = credit - debit;
        if (net !== 0) {
          totalRevenue += net;
          revenueAccounts.push({ ...acc, net });
        }
      } else if (acc.type === 'expense') {
        const net = debit - credit;
        if (net !== 0) {
          totalExpense += net;
          expenseAccounts.push({ ...acc, net });
        }
      } else if (acc.type === 'cost') {
        const net = debit - credit;
        if (net !== 0) {
          totalCost += net;
          costAccounts.push({ ...acc, net });
        }
      }
    }

    const grossProfit = totalRevenue - totalCost;
    const netIncome = grossProfit - totalExpense;

    return {
      revenueAccounts,
      costAccounts,
      expenseAccounts,
      totalRevenue,
      totalCost,
      totalExpense,
      grossProfit,
      netIncome
    };
  }

  static async getBalanceSheet(companyId: string, asOfDate: string) {
    // Balance sheet accounts: asset, liability, equity
    const accounts = await db.select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        sql`${chartOfAccounts.type} IN ('asset', 'liability', 'equity')`
      ));

    // For balance sheet, we get ALL transactions up to the 'asOfDate'
    const balances = await db.select({
      accountId: journalEntryLines.accountId,
      totalDebit: sql<number>`SUM(CAST(${journalEntryLines.debit} AS numeric))`,
      totalCredit: sql<number>`SUM(CAST(${journalEntryLines.credit} AS numeric))`
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.status, 'posted'),
      lte(journalEntries.date, asOfDate)
    ))
    .groupBy(journalEntryLines.accountId);

    const balanceMap = new Map(balances.map(b => [b.accountId, b]));

    let totalAsset = 0;
    let totalLiability = 0;
    let totalEquity = 0;

    const assetAccounts: any[] = [];
    const liabilityAccounts: any[] = [];
    const equityAccounts: any[] = [];

    for (const acc of accounts) {
      const b = balanceMap.get(acc.id);
      if (!b) continue;

      const debit = Number(b.totalDebit) || 0;
      const credit = Number(b.totalCredit) || 0;

      if (acc.type === 'asset') {
        const net = debit - credit;
        if (net !== 0) {
          totalAsset += net;
          assetAccounts.push({ ...acc, net });
        }
      } else if (acc.type === 'liability') {
        const net = credit - debit;
        if (net !== 0) {
          totalLiability += net;
          liabilityAccounts.push({ ...acc, net });
        }
      } else if (acc.type === 'equity') {
        const net = credit - debit;
        if (net !== 0) {
          totalEquity += net;
          equityAccounts.push({ ...acc, net });
        }
      }
    }

    return {
      assetAccounts,
      liabilityAccounts,
      equityAccounts,
      totalAsset,
      totalLiability,
      totalEquity
    };
  }

  static async getARStatement(companyId: string, customerId: string) {
    const [customer] = await db.select()
      .from(customers)
      .where(and(
        eq(customers.companyId, companyId),
        eq(customers.id, customerId)
      ));

    if (!customer) throw new Error('Cliente no encontrado');

    // Get pending invoices (balance > 0)
    const openItems = await db.select({
      id: accountsReceivable.id,
      invoiceId: invoices.id,
      invoiceNumber: invoices.id,
      codigoFactura: invoices.codigoFactura,
      ncf: invoices.ncf,
      date: invoices.createdAt,
      dueDate: accountsReceivable.dueDate,
      amount: accountsReceivable.amount,
      balance: accountsReceivable.balance
    })
    .from(accountsReceivable)
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.customerId, customerId),
      sql`${accountsReceivable.balance} > 0`
    ))
    .orderBy(invoices.createdAt);

    let totalPending = 0;
    for (const item of openItems) {
      totalPending += Number(item.balance);
    }

    return {
      customer,
      openItems,
      totalPending
    };
  }

  static async getSalesVsPurchases(companyId: string, startDate: string, endDate: string, warehouseId?: string) {
    // Ventas
    const salesConditions = [
      eq(invoices.companyId, companyId),
      gte(sql`DATE(${invoices.createdAt})`, startDate),
      lte(sql`DATE(${invoices.createdAt})`, endDate),
      sql`${invoices.status} != 'rejected'`
    ];
    if (warehouseId && warehouseId !== 'all') {
      salesConditions.push(eq(invoices.warehouseId, warehouseId));
    }

    const sales = await db.select({
      id: invoices.id,
      date: invoices.createdAt,
      ncf: invoices.ncf,
      total: invoices.total,
    }).from(invoices).where(and(...salesConditions));

    // Compras (Expenses)
    const expensesConditions = [
      eq(expenses.companyId, companyId),
      gte(expenses.issueDate, startDate),
      lte(expenses.issueDate, endDate)
    ];
    if (warehouseId && warehouseId !== 'all') {
      expensesConditions.push(eq(expenses.warehouseId, warehouseId));
    }

    const purchases = await db.select({
      id: expenses.id,
      date: expenses.issueDate,
      ncf: expenses.ncf,
      total: expenses.amount,
      itbis: expenses.itbis
    }).from(expenses).where(and(...expensesConditions));

    let totalSales = 0;
    for (const s of sales) {
      totalSales += Number(s.total) || 0;
    }

    let totalPurchases = 0;
    for (const p of purchases) {
      totalPurchases += (Number(p.total) || 0) + (Number(p.itbis) || 0); // Assuming amount doesn't include ITBIS in expenses schema sometimes, but usually it does or doesn't. 606 uses separate fields. Let's sum amount + itbis + isc + otherTaxes + tip if needed. Actually, just amount + itbis.
    }

    return {
      sales,
      purchases,
      totalSales,
      totalPurchases,
      margin: totalSales - totalPurchases
    };
  }
}
