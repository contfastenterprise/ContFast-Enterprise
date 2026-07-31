import type { ExecutionEngine } from "../contracts/ExecutionEngine";
import type { Plan } from "../contracts/Planner";
import type { AgentContext } from "../contracts/AgentContext";
import type { AgentResult } from "../contracts/AgentResult";
import type { AgentDispatcher } from "../contracts/AgentDispatcher";

/**
 * Motor de ejecución predeterminado.
 * Toma el Plan y despacha secuencialmente las tareas a los agentes correspondientes.
 */
export class DefaultExecutionEngine implements ExecutionEngine {
  private readonly dispatcher: AgentDispatcher;

  constructor(dispatcher: AgentDispatcher) {
    this.dispatcher = dispatcher;
  }

  /**
   * Ejecuta el plan iterando sobre los pasos. 
   * (Por simplicidad en esta iteración, se ejecuta de manera secuencial).
   */
  public async execute(plan: Plan, context: AgentContext): Promise<AgentResult> {
    const results: string[] = [];
    let finalAnswer = "";
    
    // Si no hay pasos, terminamos temprano
    if (plan.steps.length === 0) {
       return { success: true, content: "No hay tareas por ejecutar.", confidence: "High" };
    }

    for (const step of plan.steps) {
      let agentId = step.suggestedAgentId;
      
      if (!agentId || agentId === "unknown") {
         agentId = this.mapDomainToAgent(plan.intent.domain);
      }

      // Preparar el contexto inyectando el resultado acumulado (memoria de trabajo básica)
      const stepContext: AgentContext = {
        ...context,
        input: `[PETICIÓN ORIGINAL DEL USUARIO]: ${context.input}\n\n[TAREA ASIGNADA POR EL PLANNER]: ${step.description}\n\n[CONTEXTO ACUMULADO DE TAREAS PREVIAS]:\n${results.join('\n')}`
      };

      try {
        const result = await this.dispatcher.dispatch(agentId, stepContext);
        if (result.success) {
           results.push(`Paso '${step.id}': ${result.content}`);
           finalAnswer = result.content; // El último paso sobreescribe esto
        } else {
           throw new Error(`El agente falló en el paso '${step.id}': ${result.error}`);
        }
      } catch (error) {
        return {
          success: false,
          content: "Fallo durante la ejecución del plan.",
          confidence: "Low",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return {
      success: true,
      content: finalAnswer,
      confidence: "High"
    };
  }

  private mapDomainToAgent(domain: string): string {
    const normalized = domain.toLowerCase();
    
    if (normalized.includes('architecture') || normalized.includes('engineering') || normalized.includes('tech')) {
      return 'agent-cto-001';
    }
    
    if (normalized.includes('security') || normalized.includes('auth')) {
      return 'agent-security-001';
    }

    if (normalized.includes('database') || normalized.includes('sql')) {
      return 'agent-db-architect-001';
    }

    return 'agent-erp-expert-001';
  }
}
