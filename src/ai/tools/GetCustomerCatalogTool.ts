import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db, customers, invoices } from "@/db";
import { eq, and, sql, desc } from "drizzle-orm";

export class GetCustomerCatalogTool implements Tool {
  public readonly id = "get_customer_catalog";
  public readonly name = "Catálogo General de Clientes";
  public readonly description = "Obtiene un reporte general del catálogo de clientes activos. Muestra el número total de clientes, y una lista de los 10 clientes con mayor deuda pendiente y los 10 mejores clientes (con mayor facturación histórica).";
  
  public readonly schema = {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Breve justificación de por qué se requiere consultar el catálogo de clientes."
      }
    },
    required: ["reason"]
  };

  public readonly requiredPermissions = ["sales:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    try {
      const tenantCondition = and(
        eq(customers.companyId, context.tenantId),
        eq(customers.status, 'active')
      );

      // 1. Total de clientes
      const [totalResult] = await db
        .select({
          totalCustomers: sql<number>`COUNT(${customers.id})`
        })
        .from(customers)
        .where(tenantCondition);

      // 2. Top 10 Clientes con Mayor Deuda (Facturas unpaid o partial)
      const topDebtors = await db
        .select({
          name: customers.name,
          rncCedula: customers.rncCedula,
          totalDebt: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          pendingInvoices: sql<number>`COUNT(${invoices.id})`
        })
        .from(customers)
        .innerJoin(invoices, eq(customers.id, invoices.customerId))
        .where(
          and(
            tenantCondition,
            eq(invoices.modo, 'PRODUCCION'),
            sql`invoices.status IN ('signed', 'submitted', 'accepted')`,
            sql`invoices.payment_status IN ('unpaid', 'partial')`
          )
        )
        .groupBy(customers.id, customers.name, customers.rncCedula)
        .orderBy(desc(sql`SUM(${invoices.total})`))
        .limit(10);

      // 3. Top 10 Mejores Clientes (Mayor volumen histórico)
      const topBuyers = await db
        .select({
          name: customers.name,
          rncCedula: customers.rncCedula,
          lifetimeValue: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          totalInvoices: sql<number>`COUNT(${invoices.id})`
        })
        .from(customers)
        .innerJoin(invoices, eq(customers.id, invoices.customerId))
        .where(
          and(
            tenantCondition,
            eq(invoices.modo, 'PRODUCCION'),
            sql`invoices.status IN ('signed', 'submitted', 'accepted')`
          )
        )
        .groupBy(customers.id, customers.name, customers.rncCedula)
        .orderBy(desc(sql`SUM(${invoices.total})`))
        .limit(10);

      return {
        success: true,
        summary: {
          totalActiveCustomers: Number(totalResult?.totalCustomers || 0)
        },
        top10_CustomersWithDebt: topDebtors.map(c => ({
          name: c.name,
          rncCedula: c.rncCedula || 'N/A',
          totalDebt: Number(c.totalDebt),
          pendingInvoices: Number(c.pendingInvoices)
        })),
        top10_BestCustomers: topBuyers.map(c => ({
          name: c.name,
          rncCedula: c.rncCedula || 'N/A',
          lifetimeValue: Number(c.lifetimeValue),
          totalInvoices: Number(c.totalInvoices)
        })),
        printInstructions: "Informa al usuario que el catálogo completo de clientes puede ser gestionado y exportado desde el módulo de [Contactos > Clientes](/dashboard/contacts/customers)."
      };
    } catch (error) {
      throw new Error(`Error al consultar catálogo de clientes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
