import type { AgentContext } from "./AgentContext";
import type { AgentResult } from "./AgentResult";
import type { AgentManifest } from "./AgentManifest";

/**
 * Contrato principal que define la API pública para todos los agentes dentro del AI Core.
 */
export interface Agent {
  /**
   * Manifiesto declarativo y fuertemente tipado que expone toda la configuración
   * estática, metadatos, permisos y reglas del agente.
   */
  readonly manifest: AgentManifest;

  /**
   * Ejecuta la lógica principal del agente en base a un contexto proporcionado.
   *
   * @param context - El contexto de ejecución.
   * @returns Una promesa que resuelve al resultado estandarizado de la ejecución.
   */
  execute(context: AgentContext): Promise<AgentResult>;
}
