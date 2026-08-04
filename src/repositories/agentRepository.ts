import { db, invoices, expenses, agentProposals, withTenantMode } from '@/db';
import { eq, and, desc, sql, gte, isNull, inArray } from 'drizzle-orm';

export class AgentRepository {
  static async aggregateCashFlow(companyId: string, days: number = 30, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const ctx = { companyId, modo };
    const startOfRange = new Date();
    startOfRange.setUTCDate(startOfRange.getUTCDate() - days);

    // Sales metrics
    const salesData = await db.select({
      totalSales: sql<number>`sum(${invoices.total})`,
      totalPending: sql<number>`sum(case when ${invoices.paymentStatus} != 'paid' then ${invoices.total} else 0 end)`,
    }).from(invoices)
    .where(
      and(
        withTenantMode(invoices, ctx, gte(invoices.createdAt, startOfRange), inArray(invoices.status, ['accepted', 'signed', 'submitted']), isNull(invoices.deletedAt))
      )
    );

    // Expense metrics
    const expenseData = await db.select({
      totalExpenses: sql<number>`sum(${expenses.amount})`,
    }).from(expenses)
    .where(
      and(
        withTenantMode(expenses, ctx, gte(expenses.createdAt, startOfRange), isNull(expenses.deletedAt))
      )
    );

    const totalSales = Number(salesData[0]?.totalSales || 0);
    const totalPending = Number(salesData[0]?.totalPending || 0);
    const totalCollected = totalSales - totalPending;
    const totalExpenses = Number(expenseData[0]?.totalExpenses || 0);

    return {
      periodDays: days,
      metrics: {
        totalInvoiced: totalSales,
        totalCollected: totalCollected,
        totalExpenses: totalExpenses,
        netCashFlow: totalCollected - totalExpenses,
        pendingAccountsReceivable: totalPending
      }
    };
  }

  static async createProposal(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', area: string, aiResult: any) {
    const [inserted] = await db.insert(agentProposals).values({
      companyId,
      modo,
      area,
      summary: aiResult.summary,
      justification: aiResult.justification,
      confidenceLevel: aiResult.confidenceLevel,
      riskLevel: aiResult.riskLevel,
      status: 'pending'
    }).returning();
    return inserted;
  }

  static async getProposals(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    return await db.select()
      .from(agentProposals)
      .where(withTenantMode(agentProposals, { companyId, modo }, isNull(agentProposals.deletedAt)))
      .orderBy(desc(agentProposals.createdAt));
  }

  static async updateProposalStatus(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', status: 'approved' | 'rejected', userId: string) {
    const [updated] = await db.update(agentProposals)
      .set({ status, userId, updatedAt: new Date() })
      .where(
        and(
          eq(agentProposals.id, id),
          withTenantMode(agentProposals, { companyId, modo })
        )
      ).returning();
    return updated;
  }
}
