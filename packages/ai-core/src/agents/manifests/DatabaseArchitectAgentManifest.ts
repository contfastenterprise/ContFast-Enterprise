import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const DatabaseArchitectAgentManifest: AgentManifest = {
  id: "agent-db-architect-001",
  name: "AI Database Architect",
  version: "1.0.0",
  description: "Diseña tablas, índices, migraciones, optimiza consultas y mantiene la integridad de la base de datos.",
  domain: "Database",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [],
  memory: {
    enabled: true,
    type: MemoryType.Business
  }
};
