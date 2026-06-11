// src/app/api/v1/reports/606/route.ts
import { NextResponse } from 'next/server';
import { getExpenses, generate606Txt, createExpense } from '@/services/expenseService';

/** GET: Return expenses and aggregated totals for a period */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const period = url.searchParams.get('period'); // format YYYY-MM
  if (!companyId || !period) {
    return NextResponse.json({ error: 'companyId and period are required' }, { status: 400 });
  }
  const expenses = await getExpenses(companyId, period);
  const totals = expenses.reduce(
    (acc, e) => {
      acc.amount += Number(e.amount);
      acc.itbis += Number(e.itbis);
      acc.itbisRetained += Number(e.itbisRetained);
      return acc;
    },
    { amount: 0, itbis: 0, itbisRetained: 0 }
  );
  return NextResponse.json({ expenses, totals });
}

/** POST: Create a new expense (and auto CXP entry) */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const expense = await createExpense(body);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error('Error creating expense', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
