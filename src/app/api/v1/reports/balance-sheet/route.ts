import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, chartOfAccounts, journalEntryLines, journalEntries } from '@/db';
import { eq, and, isNull, lte, sql } from 'drizzle-orm';

/**
 * GET /api/v1/reports/balance-sheet - General Balance Sheet (Assets, Liabilities, Equity)
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
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // 1. Fetch sum of debits/credits grouped by accountId up to date
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
          lte(journalEntries.date, dateStr),
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

    // 3. Process Balance Sheet accounts (Assets, Liabilities, Equity)
    const balanceSheetAccounts = accounts
      .filter((acc) => acc.type === 'asset' || acc.type === 'liability' || acc.type === 'equity')
      .map((acc) => {
        const sum = sumsMap[acc.id] || { debit: 0, credit: 0 };
        let balance = 0;

        if (acc.type === 'asset') {
          balance = sum.debit - sum.credit;
        } else {
          // Liabilities & Equity
          balance = sum.credit - sum.debit;
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

    // 4. Group totals by category
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    balanceSheetAccounts.forEach((acc) => {
      if (acc.type === 'asset') totalAssets += acc.balance;
      else if (acc.type === 'liability') totalLiabilities += acc.balance;
      else if (acc.type === 'equity') totalEquity += acc.balance;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          date: dateStr,
          summary: {
            total_assets: totalAssets,
            total_liabilities: totalLiabilities,
            total_equity: totalEquity,
            balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05,
          },
          accounts: balanceSheetAccounts,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/reports/balance-sheet:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
