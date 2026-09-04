export interface CashFlowMetrics {
  periodDays: number;
  metrics: {
    totalInvoiced: number;
    totalCollected: number;
    totalExpenses: number;
    netCashFlow: number;
    pendingAccountsReceivable: number;
  };
}

export interface CashFlowProposal {
  summary: string;
  justification: string;
  confidenceLevel: 'alta' | 'media' | 'baja';
  riskLevel: 'bajo' | 'medio' | 'alto';
}

export class GeminiService {
  static async analyzeCashFlow(metrics: CashFlowMetrics): Promise<CashFlowProposal> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const prompt = `
Eres un experto analista financiero. Analiza estos números anónimos de flujo de caja y devuelve una propuesta gerencial.
No menciones clientes, proveedores, ni datos personales.
Métricas del período (${metrics.periodDays} días):
- Total Facturado (Ventas): ${metrics.metrics.totalInvoiced}
- Total Cobrado (Ingreso Real): ${metrics.metrics.totalCollected}
- Gastos Totales: ${metrics.metrics.totalExpenses}
- Flujo de Caja Neto (Cobrado - Gastos): ${metrics.metrics.netCashFlow}
- Cuentas por Cobrar Pendientes: ${metrics.metrics.pendingAccountsReceivable}

Devuelve ÚNICAMENTE un JSON válido con la siguiente estructura:
{
  "summary": "Resumen ejecutivo de 2 o 3 líneas",
  "justification": "Explicación detallada de la propuesta basada en los números numéricos",
  "confidenceLevel": "alta" | "media" | "baja",
  "riskLevel": "bajo" | "medio" | "alto"
}
`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini error details:', errText);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errText}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('No text response from Gemini');
      }

      return JSON.parse(textResponse) as CashFlowProposal;
    } catch (error) {
      console.error('Error calling Gemini:', error);
      throw new Error('Error al analizar los datos con IA.');
    }
  }
}
