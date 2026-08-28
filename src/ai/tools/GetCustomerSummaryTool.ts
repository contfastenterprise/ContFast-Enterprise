import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db, customers, invoices } from "@/db";
import { eq, and, sql, ilike, or } from "drizzle-orm";

export class GetCustomerSummaryTool implements Tool {
  public readonly id = "get_customer_summary";
  public readonly name = "Reporte de Cliente";
  public readonly description = "Obtiene un reporte consolidado de un cliente específico (buscando por nombre o RNC/Cédula). Retorna sus datos, límite de crédito, total facturado históricamente y balance en facturas pendientes.";
  
  public readonly schema = {
    type: "object",
    properties: {
      searchQuery: { 
        type: "string", 
        description: "Nombre o RNC/Cédula del cliente a buscar."
      },
      reason: {
        type: "string",
        description: "Breve justificación de la consulta."
      }
    },
    required: ["searchQuery", "reason"]
  };

  public readonly requiredPermissions = ["sales:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { searchQuery } = args;
    
    if (typeof searchQuery !== 'string' || !searchQuery.trim()) {
      throw new Error("El parámetro 'searchQuery' es obligatorio.");
    }

    try {
      // 1. Buscar el cliente
      const [customer] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.companyId, context.tenantId),
            eq(customers.status, 'active'),
            or(
              ilike(customers.name, `%${searchQuery}%`),
              eq(customers.rncCedula, searchQuery)
            )
          )
        )
        .limit(1);

      if (!customer) {
        return {
          success: false,
          message: `No se encontró ningún cliente activo que coincida con la búsqueda: "${searchQuery}".`
        };
      }

      // 2. Consolidar ventas del cliente
      const [salesStats] = await db
        .select({
          totalBilled: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          invoiceCount: sql<number>`COUNT(${invoices.id})`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, context.tenantId),
            eq(invoices.modo, context.modo),
            eq(invoices.customerId, customer.id),
            sql`invoices.status IN ('signed', 'submitted', 'accepted')`
          )
        );

      // 3. Consolidar deudas (Facturas no pagadas o parciales)
      const [debtStats] = await db
        .select({
          pendingInvoicesAmount: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          pendingInvoicesCount: sql<number>`COUNT(${invoices.id})`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, context.tenantId),
            eq(invoices.modo, context.modo),
            eq(invoices.customerId, customer.id),
            sql`invoices.status IN ('signed', 'submitted', 'accepted')`,
            sql`invoices.payment_status IN ('unpaid', 'partial')`
          )
        );

      return {
        success: true,
        customer: {
          name: customer.name,
          rncCedula: customer.rncCedula || 'N/A',
          email: customer.email || 'N/A',
          phone: customer.phone || 'N/A',
          creditLimit: Number(customer.creditLimit || 0),
        },
        salesHistory: {
          totalBilled: Number(salesStats?.totalBilled || 0),
          invoiceCount: Number(salesStats?.invoiceCount || 0),
        },
        currentDebt: {
          pendingInvoicesAmount: Number(debtStats?.pendingInvoicesAmount || 0),
          pendingInvoicesCount: Number(debtStats?.pendingInvoicesCount || 0),
        },
        printInstructions: "Informa al usuario que puede consultar el estado de cuenta detallado de este cliente desde el módulo de [Contactos > Clientes](/dashboard/contacts/customers)."
      };
    } catch (error) {
      throw new Error(`Error al consultar cliente: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
