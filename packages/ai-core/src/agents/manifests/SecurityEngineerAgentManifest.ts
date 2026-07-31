import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";
import { PolicyMode } from "../../contracts/Policy";

export const SecurityEngineerAgentManifest: AgentManifest = {
  id: "agent-security-001",
  name: "AI Security Engineer",
  version: "1.0.0",
  description: "Revisa permisos, multi-tenant, autenticación, autorización, auditoría y OWASP.",
  domain: "Security",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [
    {
      id: "policy-security-zero-trust",
      description: "Debe aplicar principios Zero-Trust en todas las revisiones y diseños.",
      enforcementLevel: PolicyMode.Strict
    }
  ],
  memory: {
    enabled: true,
    type: MemoryType.Knowledge
  }
};
