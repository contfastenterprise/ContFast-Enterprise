import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const SoftwareArchitectAgentManifest: AgentManifest = {
  id: "agent-architect-001",
  name: "AI Software Architect",
  version: "1.0.0",
  description: "Diseña antes de programar. Analiza impacto, diseña módulos, APIs, base de datos, eventos, interfaces y patrones. Entrega documentos y diagramas.",
  domain: "Architecture",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [],
  memory: {
    enabled: true,
    type: MemoryType.Semantic
  }
};
