import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";
import { PolicyMode } from "../../contracts/Policy";

export const CodeReviewerAgentManifest: AgentManifest = {
  id: "agent-reviewer-001",
  name: "AI Code Reviewer",
  version: "1.0.0",
  description: "Revisa Pull Requests, detecta malas prácticas, verifica SOLID, Clean Code, seguridad y rendimiento. Nunca programa.",
  domain: "Quality Assurance",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [
    {
      id: "policy-reviewer-no-code",
      description: "El Code Reviewer nunca escribe código, solo aprueba, rechaza o sugiere cambios.",
      enforcementLevel: PolicyMode.Strict
    }
  ],
  memory: {
    enabled: true,
    type: MemoryType.Working
  }
};
