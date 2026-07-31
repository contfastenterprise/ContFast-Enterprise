import { DefaultToolExecutor } from "./src/tools/DefaultToolExecutor";
import { ToolRegistry } from "./src/tools/ToolRegistry";
import type { Tool } from "./src/contracts/Tool";
import type { AgentContext } from "./src/contracts/AgentContext";

// ============================================
// Herramienta Simulada: Eliminar Factura
// ============================================
class DeleteInvoiceTool implements Tool {
  id = "delete_invoice_tool";
  name = "Eliminar Factura";
  description = "Elimina una factura de la base de datos de contabilidad.";
  schema = {
    type: "object",
    properties: { invoiceId: { type: "string" } },
    required: ["invoiceId"]
  };
  
  // 🔥 REGLA DE SEGURIDAD: Solo usuarios con este permiso pueden ejecutarla.
  requiredPermissions = ["invoice:delete"];

  async execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    console.log(`\n   [Base de Datos] 💥 Factura ${args.invoiceId} eliminada físicamente por el usuario ${context.userId}`);
    return { success: true, message: `Factura ${args.invoiceId} eliminada.` };
  }
}

// ============================================
// Flujo Principal
// ============================================
async function main() {
  console.log("=========================================");
  console.log("Iniciando ERP AI Core - Test de Seguridad (Tools)");
  console.log("=========================================\n");

  const registry = new ToolRegistry();
  registry.register(new DeleteInvoiceTool());
  
  const executor = new DefaultToolExecutor(registry);

  // Escenario 1: Usuario NO Autorizado (Hacker o Empleado Básico)
  const hackerContext: AgentContext = {
    tenantId: "TENANT_DEMO_001",
    userId: "USER_GUEST_007",
    language: "es", timezone: "UTC",
    permissions: ["invoice:read"], // SOLO PUEDE LEER
    enabledModules: ["sales"],
    input: "Elimina la factura F-100 por favor."
  };

  console.log("--- INTENTO 1: Usuario SIN permisos ('USER_GUEST_007') intentando borrar una factura ---");
  try {
    await executor.executeTool("delete_invoice_tool", { invoiceId: "F-100" }, hackerContext);
  } catch (error) {
    console.error("🛑 RESULTADO:", error instanceof Error ? error.message : String(error));
  }

  // Escenario 2: Usuario Autorizado (Administrador)
  const adminContext: AgentContext = {
    tenantId: "TENANT_DEMO_001",
    userId: "USER_ADMIN_999",
    language: "es", timezone: "UTC",
    permissions: ["invoice:read", "invoice:delete"], // TIENE EL PERMISO
    enabledModules: ["sales"],
    input: "Elimina la factura F-200 por favor."
  };

  console.log("\n--- INTENTO 2: Usuario CON permisos ('USER_ADMIN_999') intentando borrar una factura ---");
  try {
    await executor.executeTool("delete_invoice_tool", { invoiceId: "F-200" }, adminContext);
    console.log("✅ RESULTADO: Ejecución finalizada correctamente.");
  } catch (error) {
    console.error("🛑 RESULTADO:", error instanceof Error ? error.message : String(error));
  }
  
  console.log("\n=========================================\n");
}

main();
