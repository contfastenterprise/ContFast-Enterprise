import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const BusinessAnalystAgentManifest: AgentManifest = {
  id: "agent-business-analyst-001",
  name: "AI Business Analyst",
  version: "1.0.0",
  description: "Analiza requerimientos, traduce procesos de negocio, detecta impactos y valida reglas del ERP.",
  domain: "Business",
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
