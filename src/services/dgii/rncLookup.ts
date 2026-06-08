export interface RncLookupResult {
  success: boolean;
  rnc: string;
  name: string;
  status: string;
  message?: string;
}

export class DGIIService {
  /**
   * Consulta la Razón Social y el Estado de un RNC/Cédula
   * Utilizando una API pública de consulta DGII (o proxy).
   */
  static async lookupRNC(rnc: string): Promise<RncLookupResult> {
    try {
      // Usamos una API pública de terceros común en RD para consultar RNCs 
      // Si cuentas con una API privada o una URL oficial, debes cambiar esta constante.
      const url = `https://dgii.marte.dev/v1/rnc/${rnc}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 86400 } // Cachear resultados por 24 horas para no saturar la API
      });

      if (!response.ok) {
        throw new Error('No se pudo contactar al servicio de consulta.');
      }

      const data = await response.json();

      if (data.success && data.data) {
        return {
          success: true,
          rnc: data.data.rnc,
          name: data.data.name || data.data.commercial_name,
          status: data.data.status,
        };
      }

      return {
        success: false,
        rnc,
        name: '',
        status: '',
        message: 'RNC/Cédula no encontrado en los registros.',
      };

    } catch (error: any) {
      console.error('Error fetching RNC from DGII proxy:', error);
      return {
        success: false,
        rnc,
        name: '',
        status: '',
        message: 'Error de red al consultar DGII.',
      };
    }
  }
}
