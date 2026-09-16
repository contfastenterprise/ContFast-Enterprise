import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { getExpenses, createExpense } from '@/services/expenseService';

/** GET: Return expenses and aggregated totals for a period */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    // El navegador no tiene por que decir de que empresa es: la sesion ya lo
    // dice. Era obligatorio, y la pantalla del 606 mandaba el literal
    // 'TODO_COMPANY_ID', con lo que esta ruta contestaba 403 siempre y la
    // tabla salia vacia todos los meses. Se sigue admitiendo que venga, porque
    // el rol `sistemas` consulta empresas ajenas con este mismo parametro, y
    // la comprobacion de abajo no cambia.
    const companyId = searchParams.get('companyId') || auth.companyId;
    const period = searchParams.get('period'); // format YYYY-MM

    if (!period) {
      return NextResponse.json({ error: 'period is required' }, { status: 400 });
    }

    if (auth.role !== 'sistemas' && auth.companyId !== companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const expenses = await getExpenses(companyId, period, auth.modo);
    const totals = expenses.reduce(
      (acc, e) => {
        acc.amount += Number(e.amount);
        acc.itbis += Number(e.itbis);
        acc.itbisRetained += Number(e.itbisRetained);
        return acc;
      },
      { amount: 0, itbis: 0, itbisRetained: 0 }
    );
    return NextResponse.json({ expenses, totals }, { headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error fetching 606 report:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json({ error: e.message || 'Error interno' }, { status });
  }
}

/** POST: Create a new expense (and auto CXP entry) */
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'proveedores', 'write');

    const body = await req.json();

    if (auth.role !== 'sistemas' && auth.companyId !== body.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const expense = await createExpense(body);
    return NextResponse.json({ expense }, { status: 201, headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error creating expense', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json({ error: e.message || 'Failed to create expense' }, { status });
  }
}
