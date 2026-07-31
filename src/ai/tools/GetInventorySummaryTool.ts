import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db, products, inventoryLevels } from "@/db";
import { eq, and, sql, desc, asc } from "drizzle-orm";

export class GetInventorySummaryTool implements Tool {
  public readonly id = "get_inventory_summary";
  public readonly name = "Resumen de Inventario General";
  public readonly description = "Obtiene un reporte general del inventario: sumatoria total monetaria, total de unidades, y los 5 productos con mayor y menor existencia.";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Breve justificación de por qué se llama a esta herramienta (ej. 'solicitado por el usuario')."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["inventory:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const tenantCondition = and(
        eq(inventoryLevels.companyId, context.tenantId),
        eq(inventoryLevels.modo, 'PRODUCCION'),
        eq(products.status, 'active')
      );

      // 1. Suma general
      const [totals] = await db
        .select({
          totalUnits: sql<number>`COALESCE(SUM(${inventoryLevels.quantity}), 0)`,
          totalValue: sql<number>`COALESCE(SUM(${inventoryLevels.quantity} * ${products.cost}), 0)`,
          uniqueProducts: sql<number>`COUNT(DISTINCT ${products.id})`,
        })
        .from(inventoryLevels)
        .innerJoin(products, eq(inventoryLevels.productId, products.id))
        .where(tenantCondition);

      // 2. Top 5 Mayor Mercancía
      const top5 = await db
        .select({
          sku: products.sku,
          name: products.name,
          quantity: sql<number>`SUM(${inventoryLevels.quantity})`
        })
        .from(inventoryLevels)
        .innerJoin(products, eq(inventoryLevels.productId, products.id))
        .where(tenantCondition)
        .groupBy(products.id, products.sku, products.name)
        .orderBy(desc(sql`SUM(${inventoryLevels.quantity})`))
        .limit(5);

      // 3. Top 5 Menor Mercancía (Ignorando los que están en 0 si es posible, o incluyéndolos)
      const bottom5 = await db
        .select({
          sku: products.sku,
          name: products.name,
          quantity: sql<number>`SUM(${inventoryLevels.quantity})`
        })
        .from(inventoryLevels)
        .innerJoin(products, eq(inventoryLevels.productId, products.id))
        .where(tenantCondition)
        .groupBy(products.id, products.sku, products.name)
        .orderBy(asc(sql`SUM(${inventoryLevels.quantity})`))
        .limit(5);

      return {
        success: true,
        summary: {
          totalUnits: Number(totals?.totalUnits || 0),
          totalCostValue: Number(totals?.totalValue || 0),
          uniqueProductsCount: Number(totals?.uniqueProducts || 0),
        },
        top5_MostStock: top5.map(i => ({ sku: i.sku, name: i.name, quantity: Number(i.quantity) })),
        top5_LeastStock: bottom5.map(i => ({ sku: i.sku, name: i.name, quantity: Number(i.quantity) })),
        printInstructions: "Informa al usuario que el reporte de inventario completo puede ser impreso usando las plantillas diseñadas dirigiéndose al módulo de [Reportes de Inventario](/dashboard/reports/inventory)."
      };
    } catch (error) {
      throw new Error(`Error al generar reporte de inventario: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
