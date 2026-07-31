import type { ToolExecutor } from "../contracts/ToolExecutor";
import type { AgentContext } from "../contracts/AgentContext";
import type { ToolRegistry } from "./ToolRegistry";

/**
 * Motor blindado para ejecutar herramientas.
 * Intercepta todas las llamadas y actúa como firewall de seguridad.
 */
export class DefaultToolExecutor implements ToolExecutor {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Valida estrictamente los permisos antes de correr la herramienta subyacente.
   */
  public async executeTool(toolId: string, args: Record<string, unknown>, context: AgentContext): Promise<unknown> {
    const tool = this.registry.get(toolId);

    // BARRERA DE SEGURIDAD (Constitución IA)
    // El sistema comprueba si los permisos requeridos por la tool
    // están contenidos dentro de los permisos activos del contexto.
    const hasPermission = tool.requiredPermissions.every(permission => 
      context.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new Error(`Bloqueo de Seguridad: El usuario no tiene permisos suficientes para ejecutar la herramienta '${tool.id}'. Permisos faltantes o denegados.`);
    }

    try {
      // Todo en orden, ejecutamos delegando el Contexto (Tenant, etc.) a la herramienta.
      return await tool.execute(args, context);
    } catch (error) {
      // Loggear y reformatear errores para evitar exponer detalles críticos del motor
      throw new Error(`Error durante la ejecución de la herramienta '${tool.id}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retorna únicamente las herramientas a las que este usuario tiene acceso
   * para pasárselas al LLM. Evita tentar al LLM con herramientas prohibidas.
   */
  public getAvailableTools(context: AgentContext): ReadonlyArray<unknown> {
    return this.registry.getAll()
      .filter(tool => tool.requiredPermissions.every(perm => context.permissions.includes(perm)))
      .map(tool => ({
        type: "function",
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.schema
        }
      }));
  }
}
