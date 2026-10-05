/**
 * La accion de "Enviar Mensaje" de la pantalla de Soporte (lote 288), fuera del componente
 * para que el banco la ejecute contra un `fetch` sustituido.
 *
 * Hasta este lote la pantalla esperaba 1,2 s con un `setTimeout` y decia "Ticket de soporte
 * creado" sin mandar nada. Ahora pide a `POST /api/v1/support/tickets` y dice lo que pasó:
 *
 *  · **Una sola peticion aunque se pulse dos veces.** La guarda es un `ref` y no el estado:
 *    dos clics seguidos llegan antes de volver a pintar y los dos verian `submitting` en
 *    `false` (lotes 227 y 236).
 *  · **El estado manda, no el cuerpo**: la respuesta se lee con `leerRespuesta` (lote 227).
 *    Un 502 con la pagina de error de la plataforma no es "error de red".
 *  · **Lo escrito solo se borra si salio.** `alEnviar` (que limpia el formulario) solo se
 *    llama con el ticket enviado; con un fallo se avisa del motivo y el texto se queda, para
 *    poder reintentar sin volver a escribirlo.
 */
import { leerRespuesta } from '@/utils/leerRespuesta';

export interface CamposDelTicket {
  subject: string;
  category: string;
  message: string;
}

export interface AccionesDelTicket {
  pedir: typeof fetch;
  enCurso: { current: boolean };
  alCambiarEnvio: (enviando: boolean) => void;
  alEnviar: (id: string) => void;
  alFallar: (motivo: string) => void;
}

export type DesenlaceDelTicket = 'enviado' | 'fallo' | 'ignorado';

export const RUTA_DEL_TICKET = '/api/v1/support/tickets';

export async function enviarTicket(campos: CamposDelTicket, a: AccionesDelTicket): Promise<DesenlaceDelTicket> {
  if (a.enCurso.current) return 'ignorado';
  a.enCurso.current = true;
  a.alCambiarEnvio(true);
  try {
    let res: Response;
    try {
      res = await a.pedir(RUTA_DEL_TICKET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
      });
    } catch {
      a.alFallar('No se pudo conectar con el servidor. Revise su conexión; lo escrito se conserva.');
      return 'fallo';
    }
    const leido = await leerRespuesta<{ data?: { id?: string } }>(res);
    if (leido.bien && leido.cuerpo.data?.id) {
      a.alEnviar(leido.cuerpo.data.id);
      return 'enviado';
    }
    const motivo = leido.bien ? undefined : leido.mensaje;
    a.alFallar(motivo || `No se pudo enviar el ticket (error ${leido.bien ? 'sin número de ticket' : leido.estado}). Lo escrito se conserva.`);
    return 'fallo';
  } finally {
    a.enCurso.current = false;
    a.alCambiarEnvio(false);
  }
}
