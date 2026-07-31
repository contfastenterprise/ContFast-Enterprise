import type { AgentManifest } from "../contracts/AgentManifest";

/**
 * Registro en memoria de todos los manifiestos de agentes disponibles.
 * Permite buscar la configuración de un agente por su ID sin acoplar
 * el sistema de ejecución a clases concretas.
 */
export class AgentRegistry {
  private readonly manifests = new Map<string, AgentManifest>();

  /**
   * Registra un nuevo manifiesto en el sistema.
   * Lanza un error si ya existe un agente con el mismo ID.
   */
  public register(manifest: AgentManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`El agente con ID '${manifest.id}' ya está registrado.`);
    }
    this.manifests.set(manifest.id, manifest);
  }

  /**
   * Recupera un manifiesto por su ID.
   * Lanza un error si no se encuentra.
   */
  public get(agentId: string): AgentManifest {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agente con ID '${agentId}' no encontrado en el registro.`);
    }
    return manifest;
  }
}
