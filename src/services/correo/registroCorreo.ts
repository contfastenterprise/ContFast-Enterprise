/**
 * El registro de los correos que manda el sistema. La regla, en un solo sitio.
 *
 * POR QUE ESTE FICHERO (lote 157)
 * -------------------------------
 * `system_email_logs` existe desde el principio y estaba VACIA: 0 filas, con el
 * SMTP configurado hace 85 dias y correos que si salieron (9 facturas de
 * PRODUCCION con marca de envio, la ultima del 17/09). La causa, medida el
 * 2026-09-18: el registrador solo escribia `if (companyId)`, el `companyId` era
 * OPCIONAL en el tipo del trabajo, y los dos sitios que mandan la factura al
 * cliente -la emision y el reenvio/aceptacion- encolaban sin empresa, sin modo
 * y sin referencia. Solo el correo de orden al suplidor los mandaba.
 *
 * Consecuencia: no habia forma de saber a quien se le envio, ni que envios
 * fallaron. Un correo que no llega es exactamente el fallo que nadie ve.
 *
 * Aqui no hay base de datos: se decide QUE fila corresponde a cada envio, y por
 * eso se puede ejecutar en un banco.
 */

import type { ModoOperativo } from '@/services/dgii/modoPeticion';

/** De donde sale el correo. Va en la columna `context` del registro. */
export const CONTEXTOS_CORREO = {
  factura: 'factura',
  ordenSuplidor: 'orden_suplidor',
  sistema: 'sistema',
} as const;

export type ContextoCorreo = (typeof CONTEXTOS_CORREO)[keyof typeof CONTEXTOS_CORREO];

/** Lo que trae el trabajo de la cola, en lo que toca al registro. */
export interface DatosDelEnvio {
  companyId?: string | null;
  modo?: string | null;
  context?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  to?: string | null;
  subject?: string | null;
}

/** Como acabo el intento de envio. */
export interface ResultadoDelEnvio {
  status: 'sent' | 'failed';
  errorMessage?: string | null;
  providerMessageId?: string | null;
  attachmentNames?: string[];
  ahora?: Date;
}

export interface FilaDeRegistro {
  companyId: string;
  //  `ModoOperativo`, y no la union escrita a mano: el trinquete de
  //  `verificar_modo_certificacion` cuenta esas uniones y no las deja crecer.
  modo: ModoOperativo;
  context: string;
  referenceId: string | null;
  userId: string | null;
  toEmail: string;
  subject: string;
  status: 'sent' | 'failed';
  attachmentNames: string[];
  errorMessage: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
}

/** El mensaje de error cabe en `text`, pero uno de 200 KB no ayuda a nadie. */
export const MAX_ERROR = 500;

/** Lo que la pantalla sabe del ultimo correo de un documento. */
export interface UltimoCorreo {
  correoEstado?: string | null;
  correoFecha?: string | null;
  correoError?: string | null;
}

/**
 * Lo que se lee al pasar por encima del boton del correo.
 *
 * `formatearFecha` se inyecta para que la pantalla use su formato local y esta
 * funcion siga siendo pura (y comprobable).
 */
export function estadoDelCorreo(doc: UltimoCorreo, formatearFecha: (f: string) => string = (f) => f): string {
  if (doc.correoEstado === 'sent') {
    const cuando = doc.correoFecha ? ` el ${formatearFecha(doc.correoFecha)}` : '';
    return `Correo enviado${cuando}. Pulse para reenviarlo.`;
  }
  if (doc.correoEstado === 'failed') {
    const motivo = (doc.correoError || '').trim();
    return `El correo NO se pudo enviar${motivo ? `: ${motivo}` : ''}. Pulse para reintentar.`;
  }
  return 'No consta ningún envío. Pulse para enviarlo al cliente.';
}

/**
 * La fila que corresponde a este envio, o `null` si NO se puede registrar.
 *
 * Solo hay un motivo para no poder: que el trabajo no diga de que empresa es
 * (la columna es obligatoria y apunta a `companies`). Desde este lote el tipo
 * del trabajo lo exige, asi que eso solo puede pasar con trabajos que ya
 * estuvieran en la cola al desplegar. Quien llama lo registra como error, no en
 * silencio.
 */
export function filaDeRegistro(datos: DatosDelEnvio, resultado: ResultadoDelEnvio): FilaDeRegistro | null {
  const companyId = (datos.companyId || '').trim();
  if (!companyId) return null;

  const ahora = resultado.ahora ?? new Date();
  const error = (resultado.errorMessage || '').trim();

  return {
    companyId,
    //  PRUEBA solo si lo dice el trabajo. Un correo sin modo es de PRODUCCION:
    //  es el valor por defecto de la columna desde que existe.
    modo: datos.modo === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION',
    context: (datos.context || '').trim() || CONTEXTOS_CORREO.sistema,
    referenceId: (datos.referenceId || '').trim() || null,
    userId: (datos.userId || '').trim() || null,
    toEmail: (datos.to || '').trim(),
    subject: (datos.subject || '').trim(),
    status: resultado.status,
    attachmentNames: resultado.attachmentNames ?? [],
    errorMessage: error ? error.slice(0, MAX_ERROR) : null,
    providerMessageId: (resultado.providerMessageId || '').trim() || null,
    //  La fecha de envio SOLO cuando salio. Un fallo con fecha de envio es una
    //  mentira que luego se lee como "se mando".
    sentAt: resultado.status === 'sent' ? ahora : null,
  };
}
