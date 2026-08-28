import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { accountsReceivable, accountsPayable, expenses } from "@/db/schema/accounting";
import { eq, and, sql, isNull } from "drizzle-orm";

export class GetAccountingSummaryTool implements Tool {
  public readonly id = "get_accounting_summary";
  public readonly name = "Resumen Contable Básico";
  public readonly description = "Muestra la salud financiera rápida: Total de Cuentas por Cobrar (AR), Total de Cuentas por Pagar (AP), y Total de Gastos registrados.";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Razón para solicitar el resumen contable."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["accounting:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const baseCondition = and(
        eq(accountsReceivable.companyId, context.tenantId),
        eq(accountsReceivable.modo, context.modo)
      );

      // Total AR (Cuentas por Cobrar pendientes)
      const [arResult] = await db
        .select({ totalAR: sql<number>`COALESCE(SUM(${accountsReceivable.balance}), 0)` })
        .from(accountsReceivable)
        .where(and(baseCondition, sql`${accountsReceivable.status} != 'paid'`));

      // Total AP (Cuentas por Pagar pendientes)
      const [apResult] = await db
        .select({ totalAP: sql<number>`COALESCE(SUM(${accountsPayable.balance}), 0)` })
        .from(accountsPayable)
        .where(
          and(
            eq(accountsPayable.companyId, context.tenantId),
            eq(accountsPayable.modo, context.modo),
            sql`${accountsPayable.status} != 'paid'`
          )
        );

      // Gastos Totales
      const [expResult] = await db
        .select({ totalExpenses: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
        .from(expenses)
        .where(
          and(
            eq(expenses.companyId, context.tenantId),
            eq(expenses.modo, context.modo),
            isNull(expenses.deletedAt)
          )
        );

      return {
        success: true,
        summary: {
          accountsReceivablePending: Number(arResult?.totalAR || 0),
          accountsPayablePending: Number(apResult?.totalAP || 0),
          totalExpensesLifetime: Number(expResult?.totalExpenses || 0)
        },
        message: "Estos son los saldos globales actuales. Para un reporte de resultados detallado, sugiere ir al módulo de Contabilidad."
      };
    } catch (error) {
      throw new Error(`Error contable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
