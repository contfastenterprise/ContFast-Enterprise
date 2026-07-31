import type { AIProvider } from "../contracts/Provider";
import type { IntentRouter } from "../contracts/IntentRouter";
import type { ExecutionEngine } from "../contracts/ExecutionEngine";
import type { AgentDispatcher } from "../contracts/AgentDispatcher";
import type { ToolExecutor } from "../contracts/ToolExecutor";
import type { AgentContext } from "../contracts/AgentContext";
import type { AgentResult } from "../contracts/AgentResult";
import type { Planner } from "../contracts/Planner";

/**
 * Contrato de dependencias requeridas para que el Kernel pueda operar.
 */
export interface AIKernelDependencies {
  readonly provider: AIProvider;
  readonly intentRouter: IntentRouter;
  readonly planner: Planner;
  readonly executionEngine: ExecutionEngine;
  readonly agentDispatcher: AgentDispatcher;
  readonly toolExecutor: ToolExecutor;
}

/**
 * El núcleo del AI Core.
 * Coordina el flujo de las peticiones basándose estrictamente en interfaces (Dependency Injection).
 */
export class AIKernel {
  private readonly provider: AIProvider;
  private readonly intentRouter: IntentRouter;
  private readonly planner: Planner;
  private readonly executionEngine: ExecutionEngine;
  private readonly agentDispatcher: AgentDispatcher;
  private readonly toolExecutor: ToolExecutor;

  constructor(dependencies: AIKernelDependencies) {
    this.provider = dependencies.provider;
    this.intentRouter = dependencies.intentRouter;
    this.planner = dependencies.planner;
    this.executionEngine = dependencies.executionEngine;
    this.agentDispatcher = dependencies.agentDispatcher;
    this.toolExecutor = dependencies.toolExecutor;
  }

  /**
   * Coordina el flujo de una petición entrante delegando cada responsabilidad.
   * Flujo: IntentRouter -> Planner -> ExecutionEngine
   * 
   * @param context - Contexto estructurado de la petición (incluye input, tenant, permisos).
   * @returns El resultado final de la ejecución generada por el o los agentes.
   */
  public async handleRequest(context: AgentContext): Promise<AgentResult> {
    // 1. Extraer la Intención
    const intent = await this.intentRouter.route(context.input);

    // 2. Crear un Plan basado en la intención
    const plan = await this.planner.createPlan(intent, context);

    // 3. Ejecutar el Plan (que despachará a múltiples agentes si es necesario)
    const result = await this.executionEngine.execute(plan, context);

    return result;
  }
}
