import type { AgentContext } from "./AgentContext";

/**
 * Contrato para el ejecutor encargado de correr herramientas de manera agnóstica.
 * Asegura la inyección del contexto de seguridad antes de cualquier acción.
 */
export interface ToolExecutor {
  /**
   * Intenta localizar y ejecutar una herramienta.
   * @param toolId El ID de la herramienta solicitada por la IA.
   * @param args Los argumentos generados por la IA.
   * @param context El contexto de seguridad y entorno real.
   */
  executeTool(toolId: string, args: Record<string, unknown>, context: AgentContext): Promise<unknown>;
  
  /**
   * Recupera la lista de herramientas permitidas/disponibles para el contexto actual.
   * Útil para inyectarlas dinámicamente en el LLM.
   */
  getAvailableTools(context: AgentContext): ReadonlyArray<unknown>;
}
