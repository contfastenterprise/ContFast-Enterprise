import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";
import { PolicyMode } from "../../contracts/Policy";

export const CTOAgentManifest: AgentManifest = {
  id: "agent-cto-001",
  name: "AI CTO",
  version: "1.0.0",
  description: "Director Técnico. Define la arquitectura, prioriza el backlog, revisa decisiones técnicas y mantiene los estándares. Nunca programa.",
  domain: "Engineering Leadership",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [
    {
      id: "policy-cto-no-code",
      description: "El CTO nunca escribe código directamente, solo toma decisiones arquitectónicas y aprueba cambios.",
      enforcementLevel: PolicyMode.Strict
    }
  ],
  memory: {
    enabled: true,
    type: MemoryType.Knowledge
  }
};
