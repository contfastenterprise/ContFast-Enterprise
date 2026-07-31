import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";

export const ProductOwnerAgentManifest: AgentManifest = {
  id: "agent-product-owner-001",
  name: "AI Product Owner",
  version: "1.0.0",
  description: "Prioriza funcionalidades, define MVP, acepta historias, gestiona roadmap y entregables.",
  domain: "Product Management",
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
