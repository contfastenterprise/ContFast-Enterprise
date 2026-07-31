import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const PromptEngineerAgentManifest: AgentManifest = {
  id: "agent-prompt-001",
  name: "AI Prompt Engineer",
  version: "1.0.0",
  description: "Diseña, versiona, optimiza y reduce tokens de los prompts para mejorar la precisión.",
  domain: "AI Operations",
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
