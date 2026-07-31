import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { suppliers } from "@/db/schema/contacts";
import { accountsPayable, expenses } from "@/db/schema/accounting";
import { eq, and, sql, desc } from "drizzle-orm";

export class GetSupplierCatalogTool implements Tool {
  public readonly id = "get_supplier_catalog";
  public readonly name = "Catálogo de Suplidores";
  public readonly description = "Obtiene el total de proveedores activos, los 10 con mayor deuda pendiente y los 10 con más volumen de compras.";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Razón para solicitar el catálogo de proveedores."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["expenses:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const tenantCondition = and(
        eq(suppliers.companyId, context.tenantId),
        eq(suppliers.status, 'active')
      );

      // Total
      const [totalResult] = await db
        .select({ totalSuppliers: sql<number>`COUNT(${suppliers.id})` })
        .from(suppliers)
        .where(tenantCondition);

      // Top Debt (Cuentas por Pagar)
      const topDebtors = await db
        .select({
          name: suppliers.name,
          rnc: suppliers.rnc,
          totalDebt: sql<number>`COALESCE(SUM(${accountsPayable.balance}), 0)`
        })
        .from(suppliers)
        .innerJoin(accountsPayable, eq(suppliers.id, accountsPayable.supplierId))
        .where(
          and(
            tenantCondition,
            eq(accountsPayable.modo, 'PRODUCCION'),
            sql`${accountsPayable.status} != 'paid'`
          )
        )
        .groupBy(suppliers.id, suppliers.name, suppliers.rnc)
        .orderBy(desc(sql`SUM(${accountsPayable.balance})`))
        .limit(10);

      // Top Volume (Gastos/Compras históricas)
      const topVolume = await db
        .select({
          name: suppliers.name,
          rnc: suppliers.rnc,
          totalPurchases: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`
        })
        .from(suppliers)
        .innerJoin(expenses, eq(suppliers.id, expenses.supplierId))
        .where(
          and(
            tenantCondition,
            eq(expenses.modo, 'PRODUCCION')
          )
        )
        .groupBy(suppliers.id, suppliers.name, suppliers.rnc)
        .orderBy(desc(sql`SUM(${expenses.amount})`))
        .limit(10);

      return {
        success: true,
        summary: { totalActiveSuppliers: Number(totalResult?.totalSuppliers || 0) },
        top10_SuppliersWithDebt: topDebtors.map(s => ({
          name: s.name,
          rnc: s.rnc || 'N/A',
          pendingDebt: Number(s.totalDebt)
        })),
        top10_SuppliersByVolume: topVolume.map(s => ({
          name: s.name,
          rnc: s.rnc || 'N/A',
          totalPurchased: Number(s.totalPurchases)
        }))
      };
    } catch (error) {
      throw new Error(`Error en catálogo de proveedores: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
