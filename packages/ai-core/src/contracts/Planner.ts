import type { Intent } from "./IntentRouter";
import type { AgentContext } from "./AgentContext";

/**
 * Representa una tarea individual dentro de un plan de ejecución.
 */
export interface PlanStep {
  readonly id: string;
  readonly description: string;
  /** Identificador del agente ideal para realizar esta tarea */
  readonly suggestedAgentId?: string;
  /** Lista de IDs de tareas que deben completarse antes de iniciar esta */
  readonly dependencies: string[];
}

/**
 * Plan de acción dinámico generado a partir de una intención.
 */
export interface Plan {
  readonly id: string;
  readonly intent: Intent;
  readonly steps: PlanStep[];
}

/**
 * Contrato para el motor de planificación.
 * Se encarga de convertir una intención compleja en una serie de pasos accionables.
 */
export interface Planner {
  createPlan(intent: Intent, context: AgentContext): Promise<Plan>;
}
