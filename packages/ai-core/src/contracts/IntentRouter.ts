/**
 * Representa la intención estructurada extraída del input del usuario.
 */
export interface Intent {
  /** Acción principal que el usuario desea ejecutar (ej. 'create', 'search', 'analyze') */
  readonly action: string;
  
  /** Dominio de negocio afectado (ej. 'Sales', 'Inventory', 'System') */
  readonly domain: string;
  
  /** Nivel de confianza numérico (0.0 a 1.0) sobre la exactitud de la intención */
  readonly confidence: number;
  
  /** Entidades o parámetros extraídos del mensaje (ej. { "invoice_id": "123" }) */
  readonly entities: Readonly<Record<string, unknown>>;
  
  /** Agente sugerido por el enrutador para manejar esta tarea (si aplica) */
  readonly suggestedAgentId?: string;
}

/**
 * Contrato para el motor encargado de decidir la intención del input.
 */
export interface IntentRouter {
  /**
   * Analiza un mensaje crudo y devuelve una estructura de intención.
   * @param input El texto o mensaje provisto por el usuario.
   */
  route(input: string): Promise<Intent>;
}
