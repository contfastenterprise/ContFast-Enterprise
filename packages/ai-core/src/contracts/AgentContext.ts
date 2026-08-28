/**
 * Contexto de ejecución obligatorio para cualquier agente.
 * Garantiza el cumplimiento de las políticas Multi-Tenant y de seguridad.
 */
export interface AgentContext {
  /** Identificador único del Tenant (Obligatorio para evitar fugas de datos) */
  readonly tenantId: string;
  
  /** Identificador del usuario que ejecuta la acción */
  readonly userId: string;
  
  /** Empresa seleccionada en el ERP */
  readonly companyId?: string;
  
  /** Sucursal seleccionada en el ERP */
  readonly branchId?: string;

  /**
   * Entorno en el que trabaja el usuario: PRODUCCION o PRUEBA.
   *
   * Obligatorio. Las herramientas lo llevaban escrito a mano como 'PRODUCCION',
   * asi que el agente respondia con cifras reales a un usuario que estaba
   * trabajando en el entorno de pruebas.
   */
  readonly modo: 'PRODUCCION' | 'PRUEBA';
  
  /** Idioma preferido por el usuario */
  readonly language: string;
  
  /** Zona horaria del usuario */
  readonly timezone: string;
  
  /** Moneda actual en contexto */
  readonly currency?: string;
  
  /** Lista de permisos activos del usuario */
  readonly permissions: ReadonlyArray<string>;
  
  /** Módulos del ERP habilitados para este Tenant */
  readonly enabledModules: ReadonlyArray<string>;
  
  /** La consulta, petición o intención delegada al agente */
  readonly input: string;

  /** El historial de la conversación */
  readonly history?: Array<{ role: string; content: string }>;
}
