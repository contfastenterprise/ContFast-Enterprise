import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { cashSessions, cashRegisters } from "@/db/schema/cash";
import { users } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";

export class GetCashSummaryTool implements Tool {
  public readonly id = "get_cash_summary";
  public readonly name = "Resumen de Cajas (Turnos)";
  public readonly description = "Obtiene los turnos de caja que están abiertos actualmente y su balance esperado.";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Razón para solicitar el cuadre de caja."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["cash:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const sessions = await db
        .select({
          registerName: cashRegisters.name,
          cashierName: users.name,
          openedAt: cashSessions.openedAt,
          initialBalance: cashSessions.initialBalance,
          expectedBalance: cashSessions.expectedBalance
        })
        .from(cashSessions)
        .innerJoin(cashRegisters, eq(cashSessions.cashRegisterId, cashRegisters.id))
        .innerJoin(users, eq(cashSessions.userId, users.id))
        .where(
          and(
            eq(cashSessions.companyId, context.tenantId),
            eq(cashSessions.modo, 'PRODUCCION'),
            eq(cashSessions.status, 'open')
          )
        );

      return {
        success: true,
        openSessionsCount: sessions.length,
        openSessions: sessions.map(s => ({
          registerName: s.registerName,
          cashierName: s.cashierName,
          openedAt: s.openedAt,
          initialBalance: Number(s.initialBalance),
          currentExpectedBalance: Number(s.expectedBalance)
        }))
      };
    } catch (error) {
      throw new Error(`Error en cuadres: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
