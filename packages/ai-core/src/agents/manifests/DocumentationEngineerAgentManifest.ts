import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const DocumentationEngineerAgentManifest: AgentManifest = {
  id: "agent-docs-001",
  name: "AI Documentation Engineer",
  version: "1.0.0",
  description: "Actualiza y crea documentación técnica, documentación de API, manuales y changelogs.",
  domain: "Documentation",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [],
  memory: {
    enabled: true,
    type: MemoryType.Knowledge
  }
};
