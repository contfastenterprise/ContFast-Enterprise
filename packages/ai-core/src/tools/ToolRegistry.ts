import type { Tool } from "../contracts/Tool";

/**
 * Registro central de todas las herramientas disponibles en el sistema.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /**
   * Registra una nueva herramienta en el ecosistema.
   */
  public register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`La herramienta '${tool.id}' ya se encuentra registrada.`);
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Devuelve una herramienta específica por ID.
   * Lanza error si no existe, impidiendo ejecuciones fantasma.
   */
  public get(toolId: string): Tool {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`La herramienta '${toolId}' no existe en el ToolRegistry.`);
    }
    return tool;
  }

  /**
   * Obtiene la lista completa de herramientas registradas.
   */
  public getAll(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }
}
