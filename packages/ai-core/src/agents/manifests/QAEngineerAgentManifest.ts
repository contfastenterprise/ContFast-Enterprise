import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const QAEngineerAgentManifest: AgentManifest = {
  id: "agent-qa-001",
  name: "AI QA Engineer",
  version: "1.0.0",
  description: "Crea pruebas unitarias, de integración y E2E. Crea mocks, fixtures y mide la cobertura del código.",
  domain: "Quality Assurance",
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
