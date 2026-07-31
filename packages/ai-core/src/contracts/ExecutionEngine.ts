import type { Intent } from "./IntentRouter";
import type { AgentContext } from "./AgentContext";
import type { AgentResult } from "./AgentResult";
import type { Plan } from "./Planner";

/**
 * Contrato para el motor que ejecuta el flujo o plan general coordinando acciones.
 */
export interface ExecutionEngine {
  /**
   * Ejecuta iterativamente el plan creado por el Planner.
   * @param plan Plan estructurado con pasos múltiples.
   * @param context El contexto de ejecución (Tenant, Usuario, etc.).
   */
  execute(plan: Plan, context: AgentContext): Promise<AgentResult>;
}
