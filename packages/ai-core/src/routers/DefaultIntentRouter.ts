import type { Intent, IntentRouter } from "../contracts/IntentRouter";
import type { AIProvider } from "../contracts/Provider";

/**
 * Implementación predeterminada del enrutador de intenciones.
 * Utiliza el AIProvider para clasificar el texto crudo del usuario
 * en una estructura predecible de datos (Intent).
 */
export class DefaultIntentRouter implements IntentRouter {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Analiza el input delegando al LLM la clasificación con un prompt de sistema estricto.
   */
  public async route(input: string): Promise<Intent> {
    const systemPrompt = `
Eres un analizador de intenciones del ERP AI Core. 
Tu única responsabilidad es leer la consulta del usuario y devolver un JSON estricto. No debes devolver ningún texto adicional.

Formato requerido:
{
  "action": "string", (ej. 'create', 'search', 'analyze')
  "domain": "string", (ej. 'Sales', 'Inventory', 'Tax')
  "confidence": 0.95, (numérico entre 0.0 y 1.0)
  "entities": {}, (pares clave-valor extraídos)
  "suggestedAgentId": "agent-id" (opcional)
}
    `.trim();

    const fullPrompt = `${systemPrompt}\n\n[USER INPUT]:\n${input}`;

    try {
      // Usamos el completion en lugar del chat para ser más directos, 
      // aunque en la práctica ambos usan el modelo subyacente.
      const rawResponse = await this.provider.chat([{ role: "user", content: fullPrompt }]);
      
      // Intentamos extraer el JSON de la respuesta
      const jsonMatch = String(rawResponse.content).match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
         throw new Error("El proveedor no devolvió un JSON válido.");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        action: String(parsed.action || 'unknown'),
        domain: String(parsed.domain || 'unknown'),
        confidence: Number(parsed.confidence || 0.0),
        entities: typeof parsed.entities === 'object' && parsed.entities !== null ? parsed.entities : {},
        suggestedAgentId: parsed.suggestedAgentId ? String(parsed.suggestedAgentId) : undefined
      };
    } catch (error) {
      // En caso de fallo crítico de parsing, devolver una intención desconocida
      return {
        action: 'error',
        domain: 'system',
        confidence: 0.0,
        entities: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}
