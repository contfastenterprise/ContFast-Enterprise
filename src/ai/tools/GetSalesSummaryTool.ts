import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db, invoices, invoiceLines, products } from "@/db";
import { eq, and, sql, gte, lte, desc, asc, isNull } from "drizzle-orm";

export class GetSalesSummaryTool implements Tool {
  public readonly id = "get_sales_summary";
  public readonly name = "Resumen de Ventas";
  public readonly description = "Obtiene un resumen consolidado de las ventas (facturas emitidas) en un rango de fechas. Retorna el total facturado, impuestos, conteo de facturas, y el top 5 de productos más y menos vendidos.";
  
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

  public readonly requiredPermissions = ["sales:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { startDate, endDate } = args;
    
    const conditions = [
      eq(invoices.companyId, context.tenantId),
      eq(invoices.modo, context.modo),
      isNull(invoices.deletedAt)
    ];

    if (typeof startDate === 'string' && startDate.trim() !== '') {
      conditions.push(gte(invoices.createdAt, new Date(startDate)));
    }
    
    if (typeof endDate === 'string' && endDate.trim() !== '') {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(invoices.createdAt, end));
    }

    try {
      // 1. Resumen general
      const [result] = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          totalTaxes: sql<number>`COALESCE(SUM(${invoices.totalTaxes}), 0)`,
          invoiceCount: sql<number>`COUNT(${invoices.id})`,
        })
        .from(invoices)
        .where(and(...conditions, sql`invoices.status IN ('signed', 'submitted', 'accepted')`));

      // Condiciones para los items de factura
      const itemsConditions = [
        ...conditions,
        sql`invoices.status IN ('signed', 'submitted', 'accepted')`
      ];

      // 2. Top 5 productos más vendidos (por cantidad)
      const top5 = await db
        .select({
          sku: products.sku,
          name: products.name,
          quantity: sql<number>`SUM(${invoiceLines.quantity})`,
          revenue: sql<number>`SUM(${invoiceLines.total})`
        })
        .from(invoiceLines)
        .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
        .innerJoin(products, eq(invoiceLines.productId, products.id))
        .where(and(...itemsConditions))
        .groupBy(products.id, products.sku, products.name)
        .orderBy(desc(sql`SUM(${invoiceLines.quantity})`))
        .limit(5);

      // 3. Top 5 productos menos vendidos (por cantidad)
      const bottom5 = await db
        .select({
          sku: products.sku,
          name: products.name,
          quantity: sql<number>`SUM(${invoiceLines.quantity})`,
          revenue: sql<number>`SUM(${invoiceLines.total})`
        })
        .from(invoiceLines)
        .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
        .innerJoin(products, eq(invoiceLines.productId, products.id))
        .where(and(...itemsConditions))
        .groupBy(products.id, products.sku, products.name)
        .orderBy(asc(sql`SUM(${invoiceLines.quantity})`))
        .limit(5);

      return {
        success: true,
        summary: {
          totalSales: Number(result?.totalSales || 0),
          totalTaxes: Number(result?.totalTaxes || 0),
          invoiceCount: Number(result?.invoiceCount || 0)
        },
        top5_MostSold: top5.map(i => ({ sku: i.sku, name: i.name, quantity: Number(i.quantity), revenue: Number(i.revenue) })),
        top5_LeastSold: bottom5.map(i => ({ sku: i.sku, name: i.name, quantity: Number(i.quantity), revenue: Number(i.revenue) })),
        printInstructions: "Informa al usuario que el reporte de ventas completo puede ser impreso usando las plantillas diseñadas dirigiéndose al módulo de [Reportes de Ventas](/dashboard/reports/sales)."
      };
    } catch (error) {
      throw new Error(`Error al consultar ventas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
