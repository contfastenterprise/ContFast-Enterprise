import type { AgentContext } from "./AgentContext";

/**
 * Contrato estricto para definir cualquier herramienta que un agente pueda usar.
 * Ninguna herramienta puede ser creada sin listar sus permisos obligatorios.
 */
export interface Tool {
  /** Identificador único de la herramienta (ej. 'get_inventory_status') */
  readonly id: string;
  
  /** Nombre humano o descriptivo */
  readonly name: string;
  
  /** Descripción clara para que el LLM sepa exactamente cuándo usarla */
  readonly description: string;
  
  /** 
   * JSON Schema estricto que define qué argumentos necesita la herramienta.
   * Esto se enviará al LLM (Groq/OpenAI) para que devuelva parámetros tipados.
   */
  readonly schema: Readonly<Record<string, unknown>>;
  
  /** 
   * Lista de permisos que el usuario DEBE poseer en el ERP para ejecutarla.
   * Si está vacía, es pública, pero por defecto debe estar restringida.
   */
  readonly requiredPermissions: ReadonlyArray<string>;

  /**
   * Ejecución real de la lógica de negocio (usualmente llamando a un Service del ERP).
   * 
   * @param args Argumentos provistos por la IA basados en el schema.
   * @param context Contexto empresarial estricto (Tenant, User, etc.).
   */
  execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown>;
}
