import type { AgentDispatcher } from "../contracts/AgentDispatcher";
import type { AgentContext } from "../contracts/AgentContext";
import type { AgentResult } from "../contracts/AgentResult";
import type { AIProvider } from "../contracts/Provider";
import { EnterpriseAgent } from "../agents/EnterpriseAgent";
import type { AgentRegistry } from "../agents/AgentRegistry";
import type { ToolExecutor } from "../contracts/ToolExecutor";

export class DefaultAgentDispatcher implements AgentDispatcher {
  private readonly provider: AIProvider;
  private readonly registry: AgentRegistry;
  private readonly toolExecutor: ToolExecutor;

  constructor(provider: AIProvider, registry: AgentRegistry, toolExecutor: ToolExecutor) {
    this.provider = provider;
    this.registry = registry;
    this.toolExecutor = toolExecutor;
  }

  public async dispatch(agentId: string, context: AgentContext): Promise<AgentResult> {
    let manifest;
    try {
      manifest = this.registry.get(agentId);
    } catch (error) {
      // Fallback in case the LLM hallucinates an agent ID (common with smaller models like llama-3.1-8b-instant)
      console.warn(`[Dispatcher Warning] Agent '${agentId}' not found. Falling back to default 'agent-erp-expert-001'`);
      manifest = this.registry.get("agent-erp-expert-001");
    }
    // Pasamos el toolExecutor al agente para que pueda llamar herramientas reales
    const agent = new EnterpriseAgent(manifest, this.provider, this.toolExecutor);
    return await agent.execute(context);
  }
}

