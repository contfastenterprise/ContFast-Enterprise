import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { db } from "@/db";
import { products } from "@/db/schema/products";
import { eq, and, or, ilike } from "drizzle-orm";

export class GetProductInfoTool implements Tool {
  public readonly id = "get_product_info";
  public readonly name = "Información de Producto Específico";
  public readonly description = "Busca un producto por SKU o nombre y devuelve su precio, costo, stock y configuración de impuestos.";
  
  public readonly schema = {
    type: "object",
    properties: {
      searchQuery: { 
        type: "string", 
        description: "SKU o Nombre del producto a buscar."
      },
      reason: {
        type: "string",
        description: "Razón para la búsqueda."
      }
    },
    required: ["searchQuery", "reason"]
  };

  public readonly requiredPermissions = ["inventory:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { searchQuery } = args;
    if (typeof searchQuery !== 'string' || !searchQuery.trim()) {
      throw new Error("El parámetro 'searchQuery' es obligatorio.");
    }

    try {
      const results = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.companyId, context.tenantId),
            eq(products.status, 'active'),
            or(
              eq(products.sku, searchQuery),
              ilike(products.name, `%${searchQuery}%`)
            )
          )
        )
        .limit(5); // Retorna hasta 5 coincidencias si buscan por nombre parcial

      if (results.length === 0) {
        return { success: false, message: `No se encontraron productos para: "${searchQuery}".` };
      }

      return {
        success: true,
        matchesFound: results.length,
        products: results.map(p => ({
          sku: p.sku || 'N/A',
          name: p.name,
          price: Number(p.price),
          cost: Number(p.cost),
          unitOfMeasure: p.unitOfMeasure
        }))
      };
    } catch (error) {
      throw new Error(`Error en búsqueda de producto: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
