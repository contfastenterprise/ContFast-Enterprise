import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const UIUXEngineerAgentManifest: AgentManifest = {
  id: "agent-uiux-001",
  name: "AI UI/UX Engineer",
  version: "1.0.0",
  description: "Diseña interfaces, revisa consistencia, accesibilidad, componentes y el Design System.",
  domain: "Frontend",
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
