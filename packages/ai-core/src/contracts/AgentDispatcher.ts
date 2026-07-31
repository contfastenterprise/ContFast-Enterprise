import type { AgentContext } from "./AgentContext";
import type { AgentResult } from "./AgentResult";

/**
 * Contrato para el despachador responsable de invocar y gestionar la ejecución de agentes concretos.
 */
export interface AgentDispatcher {
  dispatch(agentId: string, context: AgentContext): Promise<AgentResult>;
}
