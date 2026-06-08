import { db, journalEntries, journalEntryLines, chartOfAccounts, companies } from '@/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class ReportRepository {
  static async getCompanyInfo(companyId: string) {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
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
}
