import { Logger } from '@/utils/logger';

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

    } catch (error: unknown) {
      //  AVISO, NO ERROR (lote 185). Que la consulta de RNC no responda es un
      //  caso PREVISTO y ya resuelto por quien llama: `EcfValidator` en modo no
      //  estricto lo registra y sigue adelante, y en modo estricto devuelve un
      //  error de validacion al usuario. En las dos ramas la decision ya esta
      //  tomada aqui arriba.
      //
      //  Escribirlo con `console.error` lo convertia en un incidente: el
      //  interceptor de `instrumentation.ts` manda todo `console.error` a
      //  Sentry, asi que cada emision con la API caida abria un evento por algo
      //  que el sistema habia decidido tolerar. Medido en PRODUCCION el
      //  2026-09-23: salia como ERROR en una peticion que devolvio 201.
      //
      //  Solo el MENSAJE, no el error entero: la peticion lleva la clave de API
      //  en una cabecera y un volcado completo podria arrastrarla al registro.
      Logger.warn('[rncLookup] la consulta de RNC no respondio; quien llama decide', {
        rnc,
        motivo: (error as Error)?.message,
      });
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
