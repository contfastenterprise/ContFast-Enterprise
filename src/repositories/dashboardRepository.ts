import { db, invoices, checks, expenses, withTenantMode, invoiceLines, products, productCategories, apPayments, accountsPayable } from '@/db';
import { eq, and, desc, sql, gte, lte, ne, isNull, inArray } from 'drizzle-orm';

export class DashboardRepository {
  
  static async getStats(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const allInvoices = await db.select({
      id: invoices.id,
      ncf: invoices.ncf,
      ecfType: invoices.ecfType,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt,
      dgiiMessage: invoices.dgiiMessage
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    let invoicesToday = 0;
    let invoicesTodayAmount = 0;
    let invoicesYesterday = 0;
    let invoicesYesterdayAmount = 0;
    let pendingDgii = 0;
    let monthlySales = 0;
    let alertCount = 0;
    let totalInvoices = allInvoices.length;
    let alertsDetails: any[] = [];

    for (const inv of allInvoices) {
      const invDate = new Date(inv.createdAt);
      const totalAmount = parseFloat(inv.total) || 0;

      // Today stats
      if (invDate >= today) {
        invoicesToday++;
        invoicesTodayAmount += totalAmount;
      }
      // Yesterday stats
      else if (invDate >= yesterday && invDate < today) {
        invoicesYesterday++;
        invoicesYesterdayAmount += totalAmount;
      }

      // Monthly sales
      if (invDate >= startOfMonth) {
        if (inv.status === 'accepted' || inv.status === 'signed' || inv.status === 'submitted') {
          monthlySales += totalAmount;
        }
      }

      // Pending DGII (Drafts or Submitted waiting for response)
      if (inv.status === 'draft' || inv.status === 'submitted') {
        pendingDgii++;
      }

      // Alerts
      if (inv.status === 'rejected') {
        alertCount++;
        alertsDetails.push({
          id: inv.id,
          type: 'invoice_rejected',
          title: `Factura ${inv.ncf || 'sin NCF'} rechazada`,
          description: inv.dgiiMessage || 'Error de validación en la DGII',
          actionText: 'Revisar Factura',
          actionLink: `/dashboard/invoices/${inv.id}`
        });
      }
    }

    let invoicesTodayChangePct = 0;
    if (invoicesYesterday > 0) {
      invoicesTodayChangePct = Math.round(((invoicesToday - invoicesYesterday) / invoicesYesterday) * 100);
    } else if (invoicesToday > 0) {
      invoicesTodayChangePct = 100;
    }

    // Query due guarantee checks count and details.
    // IMPORTANTE: esta consulta debe coincidir 1:1 con la que alimenta la pestana
    // "Cheques en Garantia" (ApRepository.findPendingGuaranteeChecks). Si solo se
    // consultara la tabla `checks`, un cheque huerfano (sin ap_payment, con la CxP
    // borrada o soft-deleted) dispararia la alerta para siempre mientras la pantalla
    // aparece vacia, y no habria forma de limpiarlo desde la UI.
    const formattedToday = today.toISOString().split('T')[0];
    const dueChecks = await db.select({
      id: checks.id,
      checkNumber: checks.checkNumber,
      payee: checks.payee,
      amount: checks.amount
    }).from(checks)
    .innerJoin(apPayments, eq(apPayments.checkId, checks.id))
    .innerJoin(accountsPayable, eq(accountsPayable.id, apPayments.apId))
    .where(
      withTenantMode(
        checks,
        ctx,
        eq(checks.isGuarantee, true),
        eq(checks.status, 'pending'),
        lte(checks.dueDate, formattedToday),
        isNull(checks.deletedAt),
        // El pago debe seguir pendiente de aplicar
        eq(apPayments.status, 'pending_guarantee'),
        eq(apPayments.modo, modo),
        // La cuenta por pagar debe seguir viva y con balance
        isNull(accountsPayable.deletedAt),
        eq(accountsPayable.modo, modo),
        sql`${accountsPayable.balance} > 0`
      )
    );
    const dueGuaranteeChecksCount = dueChecks.length;
    
    for (const check of dueChecks) {
      alertsDetails.push({
        id: check.id,
        type: 'check_due',
        title: `Cheque en Garantía Vencido (#${check.checkNumber})`,
        description: `Cheque a nombre de ${check.payee} por RD$ ${parseFloat(check.amount).toLocaleString('es-DO')} listo para cobro.`,
        actionText: 'Ir a Compras',
        actionLink: '/dashboard/purchases?tab=cheques'
      });
    }

    return {
      invoicesToday,
      invoicesTodayAmount,
      invoicesTodayChangePct,
      pendingDgii,
      monthlySales,
      alertCount: alertCount + dueGuaranteeChecksCount,
      totalInvoices,
      monthlyGoal: 2000000, // Fixed for now
      dueGuaranteeChecksCount,
      alertsDetails
    };
  }

  static async getCategorySales(companyId: string, days: number = 30, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const sales = await db.select({
      categoryName: productCategories.name,
      totalAmount: sql<number>`sum(${invoiceLines.total})`,
    }).from(invoiceLines)
      .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      )
      .groupBy(productCategories.name);

    const grandTotalResult = await db.select({
      realTotal: sql<number>`sum(${invoices.total})`
    }).from(invoices)
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      );
    
    const realTotal = Number(grandTotalResult[0]?.realTotal) || 0;
    const lineTotalSum = sales.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);
    
    const PREDEFINED_COLORS = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', 
      '#6366f1', '#d946ef'
    ];
    
    const sortedSales = sales.sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0));
    let distributedTotal = 0;

    return sortedSales.map((s, idx) => {
      const lineAmount = Number(s.totalAmount) || 0;
      const pct = lineTotalSum > 0 ? (lineAmount / lineTotalSum) : 0;
      const name = s.categoryName || 'Sin Categoría';
      
      let amount = 0;
      if (idx === sortedSales.length - 1) {
        amount = realTotal - distributedTotal;
      } else {
        amount = realTotal * pct;
        distributedTotal += amount;
      }

      const value = realTotal > 0 ? Math.round(pct * 100) : 0;

      return {
        name,
        value,
        amount,
        color: PREDEFINED_COLORS[idx % PREDEFINED_COLORS.length]
      };
    });
  }

  static async getCollectionStatus(companyId: string, days: number = 30, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const collection = await db.select({
      paymentStatus: invoices.paymentStatus,
      totalAmount: sql<number>`sum(${invoices.total})`,
    }).from(invoices)
      .where(
        and(
          withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
        )
      )
      .groupBy(invoices.paymentStatus);

    let paid = 0;
    let unpaid = 0;
    let partial = 0;

    for (const row of collection) {
      const amount = Number(row.totalAmount) || 0;
      if (row.paymentStatus === 'paid') paid += amount;
      else if (row.paymentStatus === 'partial') partial += amount;
      else unpaid += amount; // 'unpaid'
    }

    const total = paid + unpaid + partial;
    
    return [
      { name: 'Cobrada', value: total > 0 ? Math.round((paid / total) * 100) : 0, amount: paid, color: '#10b981' },
      { name: 'Abonada', value: total > 0 ? Math.round((partial / total) * 100) : 0, amount: partial, color: '#f59e0b' },
      { name: 'Pendiente', value: total > 0 ? Math.round((unpaid / total) * 100) : 0, amount: unpaid, color: '#ef4444' }
    ];
  }

  static async getWeeklyChart(companyId: string, days: number = 7, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfRange),
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    if (days === 28) {
      const chartData = [];
      for (let w = 0; w < 4; w++) {
        const weekStart = new Date(startOfRange);
        weekStart.setUTCDate(weekStart.getUTCDate() + (w * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);

        let amount = 0;
        for (const inv of weekInvoices) {
          const invDate = new Date(inv.createdAt);
          if (invDate >= weekStart && invDate <= weekEnd) {
            amount += (parseFloat(inv.total) || 0);
          }
        }

        chartData.push({
          day: `${w + 1} semana`,
          amount
        });
      }
      
      const maxAmount = Math.max(...chartData.map(c => c.amount), 1);
      return chartData.map(c => ({
        day: c.day,
        amount: c.amount,
        pct: Math.round((c.amount / maxAmount) * 100)
      }));
    }

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - i);
      dayObjects.push(d);
    }

    const chartData = dayObjects.map(d => {
      let amount = 0;
      for (const inv of weekInvoices) {
        const invDate = new Date(inv.createdAt);
        if (
          invDate.getUTCDate() === d.getUTCDate() &&
          invDate.getUTCMonth() === d.getUTCMonth() &&
          invDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          amount += (parseFloat(inv.total) || 0);
        }
      }

      return {
        day: mapDayName[d.getUTCDay() as keyof typeof mapDayName],
        amount
      };
    });

    const maxAmount = Math.max(...chartData.map(c => c.amount), 1);
    return chartData.map(c => ({
      day: c.day,
      amount: c.amount,
      pct: Math.round((c.amount / maxAmount) * 100)
    }));
  }

  static async getRecentActivity(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    return await db.select({
      id: invoices.id,
      ncf: invoices.ncf,
      ecfType: invoices.ecfType,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt,
      buyerName: invoices.buyerName,
      buyerRnc: invoices.buyerRnc
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        ne(invoices.status, 'draft'),
        isNull(invoices.deletedAt)
      )
    )
    .orderBy(desc(invoices.createdAt))
    .limit(10);
  }

  static async getComparisonChart(companyId: string, days: number = 7, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfRange),
        inArray(invoices.status, ['accepted', 'signed', 'submitted']),
        isNull(invoices.deletedAt)
      )
    );

    const weekExpenses = await db.select({
      amount: expenses.amount,
      createdAt: expenses.createdAt
    }).from(expenses)
    .where(
      withTenantMode(
        expenses,
        ctx,
        gte(expenses.createdAt, startOfRange)
      )
    );

    if (days === 28) {
      const chartData = [];
      for (let w = 0; w < 4; w++) {
        const weekStart = new Date(startOfRange);
        weekStart.setUTCDate(weekStart.getUTCDate() + (w * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);

        let sales = 0;
        let purchases = 0;
        for (const inv of weekInvoices) {
          const invDate = new Date(inv.createdAt);
          if (invDate >= weekStart && invDate <= weekEnd) {
            sales += parseFloat(inv.total) || 0;
          }
        }
        for (const exp of weekExpenses) {
          const expDate = new Date(exp.createdAt);
          if (expDate >= weekStart && expDate <= weekEnd) {
            purchases += parseFloat(exp.amount) || 0;
          }
        }

        chartData.push({
          day: `${w + 1} semana`,
          sales,
          purchases
        });
      }
      return chartData;
    }

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - i);
      dayObjects.push(d);
    }

    const chartData = dayObjects.map(d => {
      let sales = 0;
      let purchases = 0;
      for (const inv of weekInvoices) {
        const invDate = new Date(inv.createdAt);
        if (
          invDate.getUTCDate() === d.getUTCDate() &&
          invDate.getUTCMonth() === d.getUTCMonth() &&
          invDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          sales += parseFloat(inv.total) || 0;
        }
      }
      for (const exp of weekExpenses) {
        const expDate = new Date(exp.createdAt);
        if (
          expDate.getUTCDate() === d.getUTCDate() &&
          expDate.getUTCMonth() === d.getUTCMonth() &&
          expDate.getUTCFullYear() === d.getUTCFullYear()
        ) {
          purchases += parseFloat(exp.amount) || 0;
        }
      }

      return {
        day: mapDayName[d.getUTCDay() as keyof typeof mapDayName],
        sales,
        purchases
      };
    });

    return chartData;
  }

  static async getTopCustomers(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthInvoices = await db.select({
      total: invoices.total,
      buyerName: invoices.buyerName
    }).from(invoices)
    .where(
      withTenantMode(
        invoices,
        ctx,
        gte(invoices.createdAt, startOfMonth)
      )
    );

    const customerTotals: Record<string, number> = {};
    for (const inv of monthInvoices) {
      const name = inv.buyerName || 'Consumidor Final';
      customerTotals[name] = (customerTotals[name] || 0) + (parseFloat(inv.total) || 0);
    }

    const sorted = Object.entries(customerTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return sorted;
  }
}
