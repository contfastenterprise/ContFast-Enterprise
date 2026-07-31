import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const SeniorSoftwareEngineerAgentManifest: AgentManifest = {
  id: "agent-senior-engineer-001",
  name: "AI Senior Software Engineer",
  version: "1.0.0",
  description: "Escribe el código. Implementa funcionalidades, componentes, servicios, APIs y refactoriza siguiendo la arquitectura definida.",
  domain: "Development",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [],
  memory: {
    enabled: true,
    type: MemoryType.Working
  }
};
