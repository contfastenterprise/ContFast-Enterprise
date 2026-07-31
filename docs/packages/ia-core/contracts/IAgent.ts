/**
 * Contrato oficial para todos los agentes del AI Core.
 * Ningún agente puede existir sin implementar esta interfaz.
 */

export interface IAgent {

  /**
   * Identificador único del agente.
   */
  readonly id: string;

  /**
   * Nombre del agente.
   */
  readonly name: string;

  /**
   * Dominio del negocio.
   */
  readonly domain: string;

  /**
   * Versión.
   */
  readonly version: string;

  /**
   * Descripción.
   */
  readonly description: string;

  /**
   * Capacidades soportadas.
   */
  getCapabilities(): Promise<string[]>;

  /**
   * Herramientas disponibles.
   */
  getTools(): Promise<string[]>;

  /**
   * Workflows disponibles.
   */
  getWorkflows(): Promise<string[]>;

  /**
   * Procesa una intención.
   */
  execute(
      context: AgentContext
  ): Promise<AgentResult>;

}