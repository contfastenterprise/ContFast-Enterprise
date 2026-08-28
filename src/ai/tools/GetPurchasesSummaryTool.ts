import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db, expenses } from "@/db";
import { eq, and, sql, gte, lte, isNull } from "drizzle-orm";

export class GetPurchasesSummaryTool implements Tool {
  public readonly id = "get_purchases_summary";
  public readonly name = "Resumen de Compras y Gastos";
  public readonly description = "Obtiene un resumen consolidado de las compras y gastos en un rango de fechas.";
  
  public readonly schema = {
    type: "object",
    properties: {
      startDate: { 
        type: "string", 
        description: "Fecha de inicio (YYYY-MM-DD)."
      },
      endDate: { 
        type: "string",
        description: "Fecha de fin (YYYY-MM-DD)." 
      },
      reason: {
        type: "string",
        description: "Breve justificación de la consulta."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["expenses:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { startDate, endDate } = args;
    
    const conditions = [
      eq(expenses.companyId, context.tenantId),
      eq(expenses.modo, context.modo),
      isNull(expenses.deletedAt)
    ];

    if (typeof startDate === 'string' && startDate.trim() !== '') {
      conditions.push(gte(expenses.issueDate, startDate)); // issueDate suele ser string (YYYY-MM-DD) o date
    }
    
    if (typeof endDate === 'string' && endDate.trim() !== '') {
      conditions.push(lte(expenses.issueDate, endDate));
    }

    try {
      const [result] = await db
        .select({
          totalPurchases: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
          totalTaxes: sql<number>`COALESCE(SUM(${expenses.itbis}), 0)`,
          expenseCount: sql<number>`COUNT(${expenses.id})`,
        })
        .from(expenses)
        .where(and(...conditions));

      return {
        success: true,
        summary: {
          totalPurchases: Number(result?.totalPurchases || 0),
          totalTaxes: Number(result?.totalTaxes || 0),
          expenseCount: Number(result?.expenseCount || 0)
        },
        message: `El total de compras/gastos para el periodo consultado es $${Number(result?.totalPurchases || 0).toFixed(2)} DOP con un total de ${result?.expenseCount} registros.` + 
                 (Number(result?.totalPurchases || 0) === 0 ? " (Nota: Asegúrate de tener compras registradas en este rango de fechas, que no estén anuladas, y que la 'Fecha de Emisión' corresponda al mes consultado)." : "")
      };
    } catch (error) {
      throw new Error(`Error al consultar compras: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
