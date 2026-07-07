export interface RncLookupResult {
  success: boolean;
  rnc: string;
  name: string;
  status: string;
  message?: string;
  categoria?: string;
  regimen?: string;
  actividad_economica?: string;
  provincia?: string;
  municipio?: string;
}

export class DGIIService {
  /**
   * Consulta la Razón Social y el Estado de un RNC/Cédula
   * Utilizando la API dgiiapicloud.com
   */
  static async lookupRNC(rnc: string): Promise<RncLookupResult> {
    try {
      const API_URL = 'https://pptonanntevatndjyzmk.supabase.co/functions/v1/dgii-api';
      const API_KEY = process.env.DGII_API_KEY;
      if (!API_KEY) {
        throw new Error('La variable de entorno DGII_API_KEY es obligatoria y debe estar definida.');
      }
      const url = `${API_URL}/rnc/${rnc}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': API_KEY
        },
        signal: controller.signal,
        next: { revalidate: 3600 } 
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        // Si hay error en el JSON, lo manejamos (ej: {"error":"RNC no encontrado..."})
        if (data.error) {
          return {
            success: false,
            rnc,
            name: '',
            status: '',
            message: data.error
          };
        }

        if (data && data.nombre) {
          return {
            success: true,
            rnc: data.rnc || rnc,
            name: data.nombre,
            status: data.estatus || 'Activo',
            categoria: data.categoria,
            regimen: data.regimen,
            actividad_economica: data.actividad_economica,
            provincia: data.provincia,
            municipio: data.municipio
          };
        }
      }

      return {
        success: false,
        rnc,
        name: '',
        status: '',
        message: 'La API externa no devolvió datos válidos.'
      };

    } catch (error: any) {
      console.error('Error fetching RNC from dgiiapicloud:', error);
      return {
        success: false,
        rnc,
        name: '',
        status: '',
        message: 'Error de red al consultar DGII.'
      };
    }
  }
}
