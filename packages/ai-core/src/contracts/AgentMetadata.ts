/**
 * Contrato que define la información descriptiva y visual de un agente.
 * Diseñado estrictamente como metadatos, sin impacto en la lógica de negocio.
 */
export interface AgentMetadata {
  /**
   * Nombre público y amigable para mostrar en la interfaz de usuario.
   */
  readonly displayName: string;

  /**
   * Identificador del icono o URL de la imagen representativa del agente.
   */
  readonly icon: string;

  /**
   * Código de color (e.g. Hex, RGB) asociado al agente para distinguir visualmente
   * sus acciones o representaciones gráficas.
   */
  readonly color: string;

  /**
   * Categoría general a la que pertenece el agente (e.g. 'Finance', 'Support', 'Sales').
   */
  readonly category: string;

  /**
   * Etiquetas descriptivas para facilitar la búsqueda y filtrado de agentes.
   */
  readonly tags: ReadonlyArray<string>;

  /**
   * Entidad, equipo o sistema que es dueño funcional del agente.
   */
  readonly owner: string;

  /**
   * Nombre o identificador del autor/desarrollador original del agente.
   */
  readonly author: string;

  /**
   * URL de la documentación técnica o manual de uso del agente.
   */
  readonly documentationUrl?: string;

  /**
   * URL o correo de contacto para soporte técnico relacionado con el agente.
   */
  readonly supportUrl?: string;

  /**
   * Tipo de licencia aplicable al uso y distribución del agente.
   */
  readonly license: string;
}
