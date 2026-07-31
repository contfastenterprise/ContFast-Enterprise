import type { Agent } from "../contracts/Agent";
import type { AgentManifest } from "../contracts/AgentManifest";
import type { AgentContext } from "../contracts/AgentContext";
import type { AgentResult } from "../contracts/AgentResult";
import type { AIProvider, ChatMessage } from "../contracts/Provider";
import type { ToolExecutor } from "../contracts/ToolExecutor";

export class EnterpriseAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: AIProvider;
  private readonly toolExecutor: ToolExecutor;

  constructor(manifest: AgentManifest, provider: AIProvider, toolExecutor: ToolExecutor) {
    this.manifest = manifest;
    this.provider = provider;
    this.toolExecutor = toolExecutor;
  }

  public async execute(context: AgentContext): Promise<AgentResult> {
    try {
      this.validateContext(context);
      
      const systemPrompt = this.buildSystemPrompt(context);
      const availableTools = this.toolExecutor.getAvailableTools(context);

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
      ];

      // Inject history if available (limit to last 10 to save tokens)
      if (context.history && context.history.length > 0) {
        let recentHistory = context.history.slice(-10);
        
        // Groq API usually fails if the first message after 'system' is 'assistant'.
        // We ensure the first history message we inject is a 'user' message by stripping leading assistant messages.
        while (recentHistory.length > 0 && recentHistory[0].role === 'assistant') {
          recentHistory.shift();
        }

        recentHistory.forEach(msg => {
          if (msg.content && msg.content.trim() !== '') {
            messages.push({ role: msg.role as any, content: String(msg.content) });
          }
        });
      }

      messages.push({ role: "user", content: `[INPUT DEL USUARIO/SISTEMA]:\n${context.input}` });

      let finalContent = "";
      const maxIterations = 5;

      for (let i = 0; i < maxIterations; i++) {
        const response = await this.provider.chat(messages, {
          tools: availableTools as any[]
        });

        if (response.tool_calls && response.tool_calls.length > 0) {
          messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls
          });

          for (const toolCall of response.tool_calls) {
            try {
              const args = JSON.parse(toolCall.function.arguments || "{}");
              const toolResult = await this.toolExecutor.executeTool(toolCall.function.name, args, context);
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: JSON.stringify(toolResult)
              });
            } catch (e) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: JSON.stringify({ success: false, error: String(e) })
              });
            }
          }
        } else {
          finalContent = response.content || "Sin respuesta del modelo.";
          break;
        }
      }

      return {
        success: true,
        content: finalContent,
        confidence: 'High',
      };
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      
      let friendlyError = "Parece que hubo una interrupción en el sistema de Inteligencia Artificial. Por favor, intenta formular tu pregunta nuevamente.";
      
      if (rawError.includes("rate_limit") || rawError.includes("413") || rawError.includes("tokens")) {
        friendlyError = "El sistema está procesando demasiada información en este momento. Por favor, realiza una consulta más corta o inténtalo de nuevo en unos segundos.";
      } else if (rawError.includes("400") || rawError.includes("tool_use_failed")) {
        friendlyError = "No pude procesar completamente tu solicitud. ERROR TECNICO: " + rawError;
      } else if (rawError.includes("Tenant") || rawError.includes("Seguridad")) {
        friendlyError = "Por motivos de seguridad, no se puede acceder a esta información sin una sesión válida en la empresa actual.";
      }

      return {
        success: false,
        content: "",
        confidence: 'Unknown',
        error: friendlyError
      };
    }
  }

  private validateContext(context: AgentContext): void {
    if (!context.tenantId) {
      throw new Error("Violación de Seguridad (Constitución IA): Todo agente requiere un Tenant asignado.");
    }
    if (!context.userId) {
      throw new Error("Violación de Seguridad (Constitución IA): Todo agente requiere un Usuario (Auditoría).");
    }
  }

  /**
   * Construye el Prompt Base inyectando las reglas absolutas del ERP y
   * la propia identidad/políticas del Agente.
   */
  private buildSystemPrompt(context: AgentContext): string {
    const customPolicies = this.manifest.policies && this.manifest.policies.length > 0
      ? this.manifest.policies.map(p => `- ${p.description}`).join('\n')
      : "Ninguna regla específica adicional.";

    return `
Eres el agente: ${this.manifest.name}
Rol y Descripción: ${this.manifest.description}
Dominio: ${this.manifest.domain}

CONSTITUCIÓN IA (REGLAS ESTRICTAS):
1. El ERP es la fuente oficial de la verdad. NUNCA inventes datos, nombres, fechas ni cifras relacionados al ERP. SI NO POSEES UNA HERRAMIENTA o fuente de datos real para responder a una consulta técnica o de números, DEBES indicarlo. Sin embargo, TIENES LA CAPACIDAD Y EL PERMISO de mantener una conversación fluida, interpretar lo que el usuario quiere decir, responder saludos, presentarte, y ofrecer asistencia general. No te limites solo a rechazar si no hay herramientas, interpreta la intención del usuario de forma natural y conversacional.
2. Aislamiento Multi-Tenant: Estás operando bajo el Tenant ID: ${context.tenantId}. Está estrictamente prohibido cruzar información con otros Tenants.
3. No puedes ejecutar acciones críticas o sensibles sin autorización (el sistema ya oculta las herramientas no autorizadas).
4. ESTILO DE RESPUESTA: Responde de manera sumamente objetiva, clara, directa y sin usar demasiados tecnicismos. Ve directo al grano. Tienes permitido identificarte como "Shiky" si el usuario pregunta directamente por tu identidad, pero no lo uses como muletilla.
6. EXTRACCIÓN DE DATOS: Cuando utilices una herramienta para obtener datos (ej. inventario, ventas), DEBES extraer y mostrar los números, valores y listas explícitamente en tu respuesta al usuario de manera formateada y legible. NO digas simplemente "la herramienta obtuvo los datos", ¡MUESTRA LOS DATOS!
7. FORMATO DE MONEDA: Siempre que muestres precios, costos o valores monetarios, formátalos estrictamente en formato de moneda (ej. $1,250.00) asegurando que tengan exactamente dos cifras decimales.

Tus Políticas Específicas:
${customPolicies}

Preferencias del Usuario:
- Idioma: ${context.language}
- Zona Horaria: ${context.timezone}
- Moneda: ${context.currency ?? 'No definida'}

CONTEXTO DEL SISTEMA:
- AÑO ACTUAL: ${new Date().getFullYear()}
- MES ACTUAL: ${new Date().getMonth() + 1}
- FECHA Y HORA ACTUAL: ${new Date().toLocaleString('es-DO', { timeZone: context.timezone === 'UTC' ? 'America/Santo_Domingo' : context.timezone })}
(🚨 REGLA CRÍTICA: ESTAMOS EN EL AÑO ${new Date().getFullYear()}. Si el usuario dice "julio", "este mes" o "este año", DEBES usar el año ${new Date().getFullYear()} en TODAS tus llamadas a herramientas. NUNCA uses 2023, 2024 ni ningún otro año pasado por defecto).

Procesa la siguiente petición respetando estrictamente todo lo anterior.
`.trim();
  }
}
