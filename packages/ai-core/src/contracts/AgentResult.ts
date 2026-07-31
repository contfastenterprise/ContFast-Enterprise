/**
 * Nivel de confianza exigido por la Constitución IA.
 */
export type ConfidenceLevel = 'High' | 'Medium' | 'Low' | 'Unknown';

/**
 * Resultado estandarizado de la ejecución de un agente.
 */
export interface AgentResult {
  /** Indica si la ejecución fue exitosa */
  readonly success: boolean;
  
  /** El contenido generado por el agente o el resultado de la acción */
  readonly content: string;
  
  /** Nivel de certeza de la IA respecto a la respuesta/acción */
  readonly confidence: ConfidenceLevel;
  
  /** Metadatos adicionales (ej. uso de tokens, registros de auditoría) */
  readonly metadata?: Readonly<Record<string, unknown>>;
  
  /** Mensaje de error en caso de fallo (success = false) */
  readonly error?: string;
}
