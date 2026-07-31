import type { Capability } from "./Capability";
import type { Tool } from "./Tool";
import type { Workflow } from "./Workflow";
import type { Permission } from "./Permission";
import type { Policy } from "./Policy";
import type { MemoryConfig } from "./MemoryConfig";

/**
 * Manifiesto declarativo que define de forma estática e inmutable la identidad,
 * metadatos, recursos autorizados, y reglas de gobierno de un agente.
 */
export interface AgentManifest {
  /** Identidad y Metadatos Básicos */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly domain: string;

  /** Recursos Autorizados */
  readonly capabilities: ReadonlyArray<Capability>;
  readonly tools: ReadonlyArray<Tool>;
  readonly workflows: ReadonlyArray<Workflow>;

  /** Seguridad y Gobierno */
  readonly permissions: ReadonlyArray<Permission>;
  readonly policies: ReadonlyArray<Policy>;

  /** Configuración de Memoria y Contexto */
  readonly memory: MemoryConfig;

  /** Metadatos adicionales y extensibles */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
