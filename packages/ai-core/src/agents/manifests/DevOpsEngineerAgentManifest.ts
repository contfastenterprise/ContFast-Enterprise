import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const DevOpsEngineerAgentManifest: AgentManifest = {
  id: "agent-devops-001",
  name: "AI DevOps Engineer",
  version: "1.0.0",
  description: "Gestiona Docker, CI/CD, despliegues, variables de entorno, monitoreo y backups.",
  domain: "Operations",
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
