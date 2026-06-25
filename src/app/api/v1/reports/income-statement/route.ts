import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, chartOfAccounts, journalEntryLines, journalEntries } from '@/db';
import { eq, and, isNull, gte, lte, sql } from 'drizzle-orm';

/**
 * GET /api/v1/reports/income-statement - Income Statement / Profit & Loss (Revenues, Expenses)
 */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "reportes:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_DATE_RANGE', message: 'Los parámetros start_date y end_date son requeridos.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // 1. Fetch sum of debits/credits grouped by accountId within date range
    const linesSum = await db
      .select({
        accountId: journalEntryLines.accountId,
        totalDebit: sql<string>`sum(${journalEntryLines.debit})`,
        totalCredit: sql<string>`sum(${journalEntryLines.credit})`,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(journalEntryLines.companyId, auth.companyId),
          gte(journalEntries.date, startDateStr),
          lte(journalEntries.date, endDateStr),
          eq(journalEntries.status, 'posted'),
          isNull(journalEntries.deletedAt)
        )
      )
      .groupBy(journalEntryLines.accountId);

    // 2. Fetch all accounts for the company
    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, auth.companyId), isNull(chartOfAccounts.deletedAt)))
      .orderBy(chartOfAccounts.code);

    const sumsMap: Record<string, { debit: number; credit: number }> = {};
    linesSum.forEach((row) => {
      sumsMap[row.accountId] = {
        debit: parseFloat(row.totalDebit || '0'),
        credit: parseFloat(row.totalCredit || '0'),
      };
    });

    // 3. Process Income Statement accounts (Revenues, Costs, Expenses)
    const incomeStatementAccounts = accounts
      .filter((acc) => acc.type === 'revenue' || acc.type === 'expense' || acc.type === 'cost')
      .map((acc) => {
        const sum = sumsMap[acc.id] || { debit: 0, credit: 0 };
        let balance = 0;

        if (acc.type === 'revenue') {
          balance = sum.credit - sum.debit;
        } else {
          // Expenses & Cost (debit-normal accounts)
          balance = sum.debit - sum.credit;
        }

        return {
          id: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          parentId: acc.parentId,
          debit: sum.debit,
          credit: sum.credit,
          balance,
        };
      });

    // 4. Calculate category totals
    let totalRevenues = 0;
    let totalCosts = 0;
    let totalExpenses = 0;

    incomeStatementAccounts.forEach((acc) => {
      if (acc.type === 'revenue') totalRevenues += acc.balance;
      else if (acc.type === 'cost') totalCosts += acc.balance;
      else if (acc.type === 'expense') totalExpenses += acc.balance;
    });

    const grossProfit = totalRevenues - totalCosts;
    const netIncome = grossProfit - totalExpenses;

    const revenueAccounts  = incomeStatementAccounts.filter(a => a.type === 'revenue');
    const costAccounts     = incomeStatementAccounts.filter(a => a.type === 'cost');
    const expenseAccounts  = incomeStatementAccounts.filter(a => a.type === 'expense');

    return NextResponse.json(
      {
        success: true,
        data: {
          start_date: startDateStr,
          end_date: endDateStr,
          summary: {
            total_revenues: totalRevenues,
            total_costs: totalCosts,
            total_expenses: totalExpenses,
            gross_profit: grossProfit,
            net_income: netIncome,
          },
          accounts: incomeStatementAccounts,
          revenueAccounts,
          costAccounts,
          expenseAccounts,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/reports/income-statement:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
