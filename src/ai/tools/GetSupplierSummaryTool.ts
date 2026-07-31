import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { suppliers } from "@/db/schema/contacts";
import { accountsPayable, expenses } from "@/db/schema/accounting";
import { eq, and, sql, ilike, or } from "drizzle-orm";

export class GetSupplierSummaryTool implements Tool {
  public readonly id = "get_supplier_summary";
  public readonly name = "Reporte de Proveedor Específico";
  public readonly description = "Obtiene el reporte de un suplidor buscando por nombre o RNC. Retorna compras históricas y deuda pendiente.";
  
  public readonly schema = {
    type: "object",
    properties: {
      searchQuery: { 
        type: "string", 
        description: "Nombre o RNC del suplidor a buscar."
      },
      reason: {
        type: "string",
        description: "Justificación de consulta."
      }
    },
    required: ["searchQuery", "reason"]
  };

  public readonly requiredPermissions = ["expenses:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { searchQuery } = args;
    if (typeof searchQuery !== 'string' || !searchQuery.trim()) {
      throw new Error("El parámetro 'searchQuery' es obligatorio.");
    }

    try {
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.companyId, context.tenantId),
            eq(suppliers.status, 'active'),
            or(
              ilike(suppliers.name, `%${searchQuery}%`),
              eq(suppliers.rnc, searchQuery)
            )
          )
        )
        .limit(1);

      if (!supplier) {
        return { success: false, message: `No se encontró proveedor: "${searchQuery}".` };
      }

      // Deuda
      const [debtStats] = await db
        .select({
          totalDebt: sql<number>`COALESCE(SUM(${accountsPayable.balance}), 0)`
        })
        .from(accountsPayable)
        .where(
          and(
            eq(accountsPayable.companyId, context.tenantId),
            eq(accountsPayable.modo, 'PRODUCCION'),
            eq(accountsPayable.supplierId, supplier.id),
            sql`${accountsPayable.status} != 'paid'`
          )
        );

      // Compras
      const [purchaseStats] = await db
        .select({
          totalPurchased: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.companyId, context.tenantId),
            eq(expenses.modo, 'PRODUCCION'),
            eq(expenses.supplierId, supplier.id)
          )
        );

      return {
        success: true,
        supplier: {
          name: supplier.name,
          rnc: supplier.rnc || 'N/A',
          phone: supplier.phone || 'N/A'
        },
        financials: {
          lifetimePurchased: Number(purchaseStats?.totalPurchased || 0),
          currentPendingDebt: Number(debtStats?.totalDebt || 0)
        }
      };
    } catch (error) {
      throw new Error(`Error proveedor: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
