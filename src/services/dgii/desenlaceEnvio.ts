/**
 * Un rechazo de la DGII se AFIRMA. Todo lo demas es desenlace desconocido.
 *
 * EL FALLO
 * --------
 * `invoiceSubmissionService` preguntaba lo contrario -- "?es esto un error de
 * red?" -- contra una lista de siete cadenas:
 *
 *     const isCommunicationError =
 *       lowerErrMsg.includes('auth failed') || lowerErrMsg.includes('fetcherror') ||
 *       lowerErrMsg.includes('timeout')     || lowerErrMsg.includes('timed out')  ||
 *       lowerErrMsg.includes('connection')  || lowerErrMsg.includes('typeerror')  ||
 *       lowerErrMsg.includes('aborted')     || ...;
 *     if (isCommunicationError) { ... } else { throw new EcfRejectedError(errMsg); }
 *
 * Esa lista no puede estar completa nunca. `read ECONNRESET` la esquivo --
 * "econnreset" no contiene "connection" -- y se convirtio en un rechazo
 * estructural de la DGII. Con ella se cuelan igual ECONNREFUSED, EPIPE,
 * ETIMEDOUT, ENOTFOUND, EAI_AGAIN y "socket hang up".
 *
 * Es el mismo patron de toda la auditoria, del reves: donde el codigo viejo
 * leia el silencio como "Aceptado", este lo leia como "Rechazado". Las dos
 * cosas son el mismo error -- afirmar un desenlace que no consta.
 *
 * LA REGLA
 * --------
 * El rechazo se reconoce por sus MARCAS, no por descarte:
 *
 *   - el texto dice que se rechazo ("rechaz", "rejected", "no acept"), o
 *   - `leerEstado` encuentra un estado que es de rechazo, o
 *   - la respuesta trae el detalle del validador de la DGII (los mensajes que
 *     nombran el elemento invalido, como "The element 'IdDoc' has invalid
 *     child element ...").
 *
 * Sin ninguna de esas marcas, el desenlace es DESCONOCIDO. No "aceptado", no
 * "rechazado": desconocido.
 *
 * POR QUE DESCONOCIDO ACABA EN `submitted`
 * ----------------------------------------
 * Porque ahora hay quien lo resuelva. `sincronizarPendientes` consulta el
 * veredicto cada pocos minutos, asi que:
 *
 *   - si el documento SI llego, `submitted` es el estado correcto y se resuelve
 *     solo en la siguiente pasada;
 *   - si NO llego, la consulta devuelve "no encontrado", y entonces se SABE --
 *     y reenviar con el mismo NCF es seguro, porque no hay nada que duplicar.
 *
 * Quemar el NCF sin factura, que es lo que se hacia, es peor: si el documento
 * habia llegado, queda un e-CF aceptado en la DGII sin factura en el sistema, y
 * eso no lo descubre nadie hasta que la DGII reclama.
 */
import { leerEstado } from './estadoEnvio';

export type Desenlace = 'rechazo' | 'desconocido';

export interface LecturaDesenlace {
  desenlace: Desenlace;
  /** El texto tal cual, para guardarlo sin adornos. */
  texto: string;
  /** Que marca lo identifico. `null` cuando no hubo ninguna. */
  marca: string | null;
}

/** Frases con las que la DGII y mSeller nombran un rechazo. */
const MARCAS_RECHAZO: Array<[RegExp, string]> = [
  [/\bno\s+acept/i, 'dice "no aceptado"'],
  [/rechaz/i, 'dice "rechazado"'],
  [/\brejected\b/i, 'dice "rejected"'],
  // El validador XSD de la DGII. Es la forma de rechazo mas comun y la que
  // recibio esta empresa en su primer e-44:
  //   "The element 'IdDoc' has invalid child element 'IndicadorMontoGravado'".
  [/has invalid child element/i, 'el validador nombra un elemento invalido'],
  [/is not valid according to its datatype/i, 'el validador rechaza un tipo de dato'],
  [/the element .* is invalid/i, 'el validador declara invalido un elemento'],
];

/**
 * Decide si una respuesta que NO fue un exito es un rechazo de la DGII o un
 * desenlace desconocido.
 *
 * `raw` es la respuesta completa, si la hubo. Cuando la conexion se corta no
 * hay respuesta, solo el error -- y entonces no hay marcas, que es justo lo que
 * debe pasar.
 */
export function leerDesenlace(mensaje: string | null | undefined, raw?: any): LecturaDesenlace {
  const texto = (mensaje ?? '').trim();

  for (const [patron, marca] of MARCAS_RECHAZO) {
    if (patron.test(texto)) return { desenlace: 'rechazo', texto, marca };
  }

  // Y lo que diga la respuesta, si vino alguna. Se usa la MISMA lectura que el
  // resto del sistema en vez de otra cadena de `includes`.
  if (raw != null) {
    const lectura = leerEstado(raw);
    if (lectura.estado === 'rejected') {
      return { desenlace: 'rechazo', texto, marca: `la respuesta trae estado "${lectura.textoCrudo}"` };
    }
  }

  return { desenlace: 'desconocido', texto, marca: null };
}

/**
 * El mensaje que se guarda con la factura cuando el desenlace no consta.
 *
 * Dice lo que se sabe y lo que no, y que va a pasar despues. Un "Error de red"
 * a secas deja a quien lo lee sin saber si el comprobante existe o no.
 */
export function mensajeDesconocido(texto: string): string {
  const detalle = texto ? ` (${texto})` : '';
  return (
    'Enviado, pero la respuesta no llego completa' + detalle + '. ' +
    'El comprobante PUDO haber llegado a la DGII: no se reenvia para no duplicarlo. ' +
    'El estado se consulta automaticamente y se actualizara solo.'
  );
}
