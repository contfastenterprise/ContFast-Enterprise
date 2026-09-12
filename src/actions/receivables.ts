'use server';

import { db, accountsReceivable, customers, invoices, companies, companySettings } from '@/db';
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm';
import { exigirSesion } from './_sesion';
import { enforcePermission } from '@/middleware/permissions';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { diaDe, diasEntreDias, hoyDia } from '@/utils/fechasLocales';

export async function getReceivablesDashboardData() {
  const auth = await exigirSesion();

  // AUTORIZACION, NO SOLO AUTENTICACION.
  //
  // Hasta aqui esto solo comprobaba que HUBIERA sesion. La unica puerta que
  // dejaba fuera a los demas era el menu lateral -- y un menu no es control de
  // acceso: no lo aplica nadie, solo esconde el enlace. Cualquier sesion de la
  // empresa que escribiera /dashboard/financial/accounts-receivable en la barra de
  // direcciones recibia la cartera entera.
  //
  // Es el mismo patron de ISO-03 (rutas que verifican sesion y no permiso) con
  // un agravante: la guarda que existe para impedirlo, permisosRutas.vitest.ts,
  // recorria src/app/api/**/route.ts y se detenia ahi, asi que las acciones de
  // servidor quedaban fuera de su alcance. Eso tambien se amplia en este lote.
  //
  // Lanza en vez de devolver `success: false` a proposito: es lo que ya hacia
  // la comprobacion de sesion, y ademas la pagina de pagar no mira `success`
  // -- un `false` silencioso le pintaria un panel vacio, que es la clase de
  // "no puedes" disfrazado de averia que no queremos.
  await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'cobros', 'read');
  
  const { companyId, modo } = auth;

  try {
    const companyQuery = await db.select({
      name: companies.name,
      logoUrl: companySettings.logoUrl
    })
    .from(companies)
    .leftJoin(companySettings, eq(companySettings.companyId, companies.id))
    .where(eq(companies.id, companyId))
    .limit(1);
    
    const companyInfo = companyQuery[0] || { name: 'Empresa', logoUrl: null };

    // Basic AR aggregation
    const allAr = await db.select({
      id: accountsReceivable.id,
      amount: accountsReceivable.amount,
      balance: accountsReceivable.balance,
      dueDate: accountsReceivable.dueDate,
      status: accountsReceivable.status,
      customerId: accountsReceivable.customerId,
      customerName: customers.name,
      createdAt: accountsReceivable.createdAt,
      ncf: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
    })
    .from(accountsReceivable)
    .leftJoin(customers, eq(accountsReceivable.customerId, customers.id))
    .leftJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(
      and(
        eq(accountsReceivable.companyId, companyId),
        eq(accountsReceivable.modo, modo as ModoOperativo),
        isNull(accountsReceivable.deletedAt)
      )
    );

    // Compute KPIs
    let totalPending = 0;
    let totalOverdue = 0;
    let totalToMature = 0;
    
    // Aging buckets
    const aging = {
      '0_30': 0,
      '31_60': 0,
      '61_90': 0,
      '90_plus': 0
    };

    // El dia de hoy como texto. Ni un `Date` mas en todo el calculo: las
    // fechas de vencimiento llegan como 'AAAA-MM-DD' y convertirlas a `Date`
    // las corre un dia hacia atras en cualquier huso al oeste de Greenwich.
    const hoy = hoyDia();

    const pendingInvoicesCount = allAr.filter(x => Number(x.balance) > 0).length;

    allAr.forEach(ar => {
      const bal = Number(ar.balance);
      if (bal <= 0) return;

      totalPending += bal;

      // Positivo = dias de atraso. Cero el mismo dia del vencimiento, que
      // todavia NO esta vencido: ese dia se puede pagar.
      const vence = diaDe(ar.dueDate);
      const diffDays = vence ? diasEntreDias(vence, hoy) : 0;

      if (diffDays > 0) {
        totalOverdue += bal;
        if (diffDays <= 30) aging['0_30'] += bal;
        else if (diffDays <= 60) aging['31_60'] += bal;
        else if (diffDays <= 90) aging['61_90'] += bal;
        else aging['90_plus'] += bal;
      } else {
        totalToMature += bal;
      }
    });

    const customersMap: Record<string, { name: string, debt: number }> = {};
    allAr.forEach(ar => {
      const bal = Number(ar.balance);
      if (bal > 0) {
        if (!customersMap[ar.customerId]) customersMap[ar.customerId] = { name: ar.customerName || 'N/A', debt: 0 };
        customersMap[ar.customerId].debt += bal;
      }
    });

    const topCustomers = Object.values(customersMap)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 10);

    return {
      success: true,
      data: {
        companyInfo,
        kpis: {
          totalPending,
          totalOverdue,
          totalToMature,
          pendingInvoicesCount,
          collectedThisMonth: 0, // Mock for now
        },
        aging: [
          { name: '0-30 días', value: aging['0_30'] },
          { name: '31-60 días', value: aging['31_60'] },
          { name: '61-90 días', value: aging['61_90'] },
          { name: '90+ días', value: aging['90_plus'] },
        ],
        topCustomers,
        raw: allAr, // For kanban and list fallback
      }
    };

  } catch (error: any) {
    console.error('Error fetching receivables:', error);
    return { success: false, error: error.message };
  }
}
