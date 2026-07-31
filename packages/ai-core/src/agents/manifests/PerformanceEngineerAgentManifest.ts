import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const PerformanceEngineerAgentManifest: AgentManifest = {
  id: "agent-performance-001",
  name: "AI Performance Engineer",
  version: "1.0.0",
  description: "Optimiza consultas, React, Next.js, caché, Lazy Loading y realiza profiling.",
  domain: "Performance",
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
