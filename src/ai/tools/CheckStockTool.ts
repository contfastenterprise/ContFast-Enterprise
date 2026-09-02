import type { Tool } from "@contfast/ai-core/src/contracts/Tool";
import type { AgentContext } from "@contfast/ai-core/src/contracts/AgentContext";
import { getProvisionalStock } from "@/services/inventoryService";

/**
 * Herramienta Real del ERP: Consultar Stock de Inventario
 * Conecta el AI Core con el inventoryService utilizando Drizzle ORM.
 */
export class CheckStockTool implements Tool {
  public readonly id = "check_provisional_stock";
  public readonly name = "Consultar Stock Provisional";
  public readonly description = "Consulta la cantidad disponible de un producto en un almacén específico.";
  
  // Requerido por la IA para saber qué enviar
  public readonly schema = {
    type: "object",
    properties: {
      productId: { 
        type: "string", 
        description: "El ID UUID del producto en la base de datos."
      },
      warehouseId: { 
        type: "string",
        description: "El ID UUID del almacén a consultar." 
      }
    },
    required: ["productId", "warehouseId"]
  };

  // 🔥 FIREWALL: Solo usuarios con permiso de lectura de inventario pueden correr esto.
  public readonly requiredPermissions = ["inventory:read"];

  public async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const { productId, warehouseId } = args;

    if (typeof productId !== "string" || typeof warehouseId !== "string") {
      throw new Error("Parámetros inválidos. 'productId' y 'warehouseId' deben ser strings (UUIDs).");
    }

    try {
      // Llamamos al servicio real del ERP
      // El entorno sale del contexto del agente, no fijo. El comentario que
      // habia aqui decia "asumimos PRODUCCION, podriamos extraerlo del context
      // si estuviera ahi": ya esta ahi, y es obligatorio.
      const stock = await getProvisionalStock(context.tenantId, context.modo, productId, warehouseId);
      
      return {
        success: true,
        productId,
        warehouseId,
        availableStock: stock,
        message: `El stock provisional actual es de ${stock} unidades.`
      };
    } catch (error) {
      throw new Error(`Error interno al consultar inventario: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
