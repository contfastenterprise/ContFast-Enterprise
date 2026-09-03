'use server';

import { db, accountsReceivable, customers, invoices, companies, companySettings } from '@/db';
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import * as jwt from 'jsonwebtoken';
import { modoDeCookie } from '@/services/dgii/modoPeticion';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

async function getAuthContext() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;

  try {
    // Auditoria F0-04: sin valor por defecto. El resto del sistema ya aborta al
    // arrancar si falta JWT_SECRET (src/middleware/auth.ts), asi que aceptar un
    // secreto publico aqui solo abria la puerta a tokens forjados.
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('La variable de entorno JWT_SECRET es obligatoria.');
    }
    const decoded = jwt.verify(token, secret) as any;
    
    // Accion de servidor: lee la cookie directamente. Puede faltar o venir
    // vieja -- ninguno de los dos casos debe romper la operacion. Ausente o
    // desconocida, ambas caen a PRUEBA; modoDeCookie no lanza nunca.
    const reqModo = modoDeCookie(cookieStore.get('cf_environment')?.value, 'la cookie cf_environment');
    
    return {
      userId: decoded.userId,
      companyId: decoded.companyId,
      modo: reqModo,
      role: decoded.role,
    };
  } catch (error) {
    return null;
  }
}

export async function getReceivablesDashboardData() {
  const auth = await getAuthContext();
  if (!auth) throw new Error('Unauthorized');
  
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

    const now = new Date();
    now.setHours(0,0,0,0);

    const pendingInvoicesCount = allAr.filter(x => Number(x.balance) > 0).length;

    allAr.forEach(ar => {
      const bal = Number(ar.balance);
      if (bal <= 0) return;

      totalPending += bal;

      const due = new Date(ar.dueDate);
      due.setHours(0,0,0,0);
      
      const diffTime = now.getTime() - due.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

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
