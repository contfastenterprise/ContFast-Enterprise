import { db, invoices } from '@/db';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

export class DashboardRepository {
  
  static async getStats(companyId: string) {
        const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const allInvoices = await db.select({
      id: invoices.id,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(eq(invoices.companyId, companyId));

    let invoicesToday = 0;
    let invoicesTodayAmount = 0;
    let invoicesYesterday = 0;
    let invoicesYesterdayAmount = 0;
    let pendingDgii = 0;
    let monthlySales = 0;
    let alertCount = 0;
    let totalInvoices = allInvoices.length;

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
      }
    }

    let invoicesTodayChangePct = 0;
    if (invoicesYesterday > 0) {
      invoicesTodayChangePct = Math.round(((invoicesToday - invoicesYesterday) / invoicesYesterday) * 100);
    } else if (invoicesToday > 0) {
      invoicesTodayChangePct = 100;
    }

    return {
      invoicesToday,
      invoicesTodayAmount,
      invoicesTodayChangePct,
      pendingDgii,
      monthlySales,
      alertCount,
      totalInvoices,
      monthlyGoal: 2000000 // Fixed for now
    };
  }

  static async getWeeklyChart(companyId: string, days: number = 7) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      gte(invoices.createdAt, startOfRange)
    ));

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

      let label = '';
      if (days <= 7) {
        label = mapDayName[d.getUTCDay() as keyof typeof mapDayName];
      } else {
        label = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
      }

      return {
        day: label,
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

  static async getRecentActivity(companyId: string) {
    // Recent invoices
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
    .where(eq(invoices.companyId, companyId))
    .orderBy(desc(invoices.createdAt))
    .limit(10);
  }

  static async getComparisonChart(companyId: string, days: number = 7) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfRange = new Date(startOfToday);
    startOfRange.setUTCDate(startOfRange.getUTCDate() - (days - 1));

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      gte(invoices.createdAt, startOfRange)
    ));

    const { expenses } = await import('@/db');
    const weekExpenses = await db.select({
      amount: expenses.amount,
      createdAt: expenses.createdAt
    }).from(expenses)
    .where(and(
      eq(expenses.companyId, companyId),
      gte(expenses.createdAt, startOfRange)
    ));

    const dayObjects = [];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

      let label = '';
      if (days <= 7) {
        label = mapDayName[d.getUTCDay() as keyof typeof mapDayName];
      } else {
        label = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
      }

      return {
        day: label,
        sales,
        purchases
      };
    });

    return chartData;
  }

  static async getTopCustomers(companyId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthInvoices = await db.select({
      total: invoices.total,
      buyerName: invoices.buyerName
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      gte(invoices.createdAt, startOfMonth)
    ));

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
