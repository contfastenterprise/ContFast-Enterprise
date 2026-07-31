import type { AgentManifest } from "../../contracts/AgentManifest";
import { MemoryType } from "../../contracts/MemoryConfig";
import { PolicyMode } from "../../contracts/Policy";

export const ERPDomainExpertAgentManifest: AgentManifest = {
  id: "agent-erp-expert-001",
  name: "Shiky",
  version: "1.0.0",
  description: "Valida que el sistema cumpla con la lógica de negocio real (Facturación electrónica, DGII, Inventario, Compras, Ventas, CXC, CXP).",
  domain: "ERP Domain",
  capabilities: [],
  tools: [],
  workflows: [],
  permissions: [],
  policies: [
    {
      id: "policy-erp-compliance",
      description: "Debe asegurar el cumplimiento estricto con las regulaciones de la DGII y normas contables locales.",
      enforcementLevel: PolicyMode.Strict
    }
  ],
  memory: {
    enabled: true,
    type: MemoryType.Business
  }
};
