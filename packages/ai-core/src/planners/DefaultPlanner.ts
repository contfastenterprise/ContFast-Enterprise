import type { Intent } from "../contracts/IntentRouter";
import type { AgentContext } from "../contracts/AgentContext";
import type { Plan, Planner, PlanStep } from "../contracts/Planner";
import type { AIProvider } from "../contracts/Provider";
import type { ToolExecutor } from "../contracts/ToolExecutor";

export class DefaultPlanner implements Planner {
  private readonly provider: AIProvider;
  private readonly toolExecutor: ToolExecutor;

  constructor(provider: AIProvider, toolExecutor: ToolExecutor) {
    this.provider = provider;
    this.toolExecutor = toolExecutor;
  }

  public async createPlan(intent: Intent, context: AgentContext): Promise<Plan> {
    const availableTools = this.toolExecutor.getAvailableTools(context);
    // OPTIMIZATION: Only pass name and description to the Planner to save massive tokens
    const simplifiedTools = availableTools.map((t: any) => ({ name: t.name, description: t.description }));
    const toolsContext = simplifiedTools.length > 0 
      ? JSON.stringify(simplifiedTools, null, 2)
      : "Ninguna herramienta disponible.";

    const systemPrompt = `
Eres el Planner del ERP AI Core. 
Tu única responsabilidad es tomar la Intención detectada del usuario y desglosarla en una lista de pasos (tareas) para ser ejecutadas.
Debes devolver exclusivamente un JSON estricto. No devuelvas ningún otro texto.

INSTRUCCIONES CLAVE:
1. Divide el problema en pasos lógicos secuenciales. Utiliza EXCLUSIVAMENTE las herramientas listadas abajo si aplican. Si una herramienta se llama "Resumen de Inventario", úsala para informes generales.
2. Si el usuario está simplemente saludando, conversando, o preguntando algo general que no requiere consultar la base de datos (por ejemplo, preguntar el nombre del agente o qué puede hacer), crea un único paso describiendo la intención conversacional del usuario para que el Agente le responda de forma natural. NUNCA asumas, inventes, ni crees tablas de ejemplo para datos del ERP.
3. El resultado debe ser un JSON estricto. NADA de texto antes o después del JSON.

HERRAMIENTAS REALES DISPONIBLES (Puedes basar tus planes en ellas):
${toolsContext}

Formato requerido:
{
  "steps": [
    {
      "id": "paso_1",
      "description": "Explicación detallada de lo que el agente debe hacer",
      "suggestedAgentId": "unknown",
      "dependencies": []
    }
  ]
}

REGLA ESTRICTA: El campo "suggestedAgentId" DEBE ser siempre "unknown", no intentes adivinar IDs de agentes.
Ten en cuenta el Dominio de la intención: ${intent.domain}

CONTEXTO DE EJECUCIÓN:
- Tenant ID: ${context.tenantId}
    `.trim();

    const fullPrompt = `${systemPrompt}\n\n[USER INPUT]:\n${context.input}`;

    try {
      const rawResponse = await this.provider.chat([{ role: "user", content: fullPrompt }]);
      const contentString = String(rawResponse.content);
      
      const jsonMatch = contentString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
         throw new Error("El modelo de Planificación no devolvió un JSON válido.");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const steps: PlanStep[] = (parsed.steps || []).map((s: any) => ({
        id: String(s.id || 'step_unknown'),
        description: String(s.description || 'Sin descripción'),
        suggestedAgentId: s.suggestedAgentId ? String(s.suggestedAgentId) : undefined,
        dependencies: Array.isArray(s.dependencies) ? s.dependencies.map(String) : []
      }));

      // Si el planner falló en generar pasos, creamos uno genérico con la intención original
      if (steps.length === 0) {
        steps.push({
          id: "step_1_fallback",
          description: context.input,
          suggestedAgentId: intent.suggestedAgentId,
          dependencies: []
        });
      }

      return {
        id: `plan_${Date.now()}`,
        intent,
        steps
      };

    } catch (error) {
      // Plan de contingencia si falla Groq al formatear
      return {
        id: `plan_error_${Date.now()}`,
        intent,
        steps: [
          {
            id: "step_error_fallback",
            description: context.input,
            suggestedAgentId: intent.suggestedAgentId,
            dependencies: []
          }
        ]
      };
    }
  }
}
