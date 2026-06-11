import { db, invoices } from '@/db';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

export class DashboardRepository {
  
  static async getStats(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    return {
      invoicesToday,
      invoicesTodayAmount,
      pendingDgii,
      monthlySales,
      alertCount,
      totalInvoices,
      monthlyGoal: 2000000 // Fixed for now
    };
  }

  static async getWeeklyChart(companyId: string) {
    const today = new Date();
    // Start of the week (Monday)
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(today.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      gte(invoices.createdAt, startOfWeek)
    ));

    const dayAmounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 }; // 1: Mon ... 0: Sun

    for (const inv of weekInvoices) {
      const invDay = new Date(inv.createdAt).getDay();
      dayAmounts[invDay as keyof typeof dayAmounts] += (parseFloat(inv.total) || 0);
    }

    // Find max for percentage
    const maxAmount = Math.max(...Object.values(dayAmounts), 1); // Avoid div by 0

    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    const chartData = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const amt = dayAmounts[d as keyof typeof dayAmounts];
      return {
        day: mapDayName[d as keyof typeof mapDayName],
        amount: amt,
        pct: Math.round((amt / maxAmount) * 100)
      };
    });

    return chartData;
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

  static async getComparisonChart(companyId: string) {
    // Same week logic
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    const weekInvoices = await db.select({
      total: invoices.total,
      createdAt: invoices.createdAt
    }).from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      gte(invoices.createdAt, startOfWeek)
    ));

    const { expenses } = await import('@/db');
    const weekExpenses = await db.select({
      amount: expenses.amount,
      createdAt: expenses.createdAt
    }).from(expenses)
    .where(and(
      eq(expenses.companyId, companyId),
      gte(expenses.createdAt, startOfWeek)
    ));

    const days = [1, 2, 3, 4, 5, 6, 0];
    const mapDayName = { 1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM' };

    const chartData = days.map(d => {
      let sales = 0;
      let purchases = 0;
      for (const inv of weekInvoices) {
        if (new Date(inv.createdAt).getDay() === d) sales += parseFloat(inv.total) || 0;
      }
      for (const exp of weekExpenses) {
        if (new Date(exp.createdAt).getDay() === d) purchases += parseFloat(exp.amount) || 0;
      }
      return {
        day: mapDayName[d as keyof typeof mapDayName],
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
