/**
 * Las frases con las que la DGII y mSeller nombran un rechazo.
 *
 * POR QUE VIVEN EN SU PROPIO FICHERO (lote 139)
 * ---------------------------------------------
 * Vivian dentro de `desenlaceEnvio.ts`, y solo las usaba la EMISION. La
 * CONSULTA de estado (`leerEstado`, en `estadoEnvio.ts`) no las veia, y ahi
 * estaba el agujero: la nota E340000000002 de Latin Doors fue rechazada por
 * estructura seis veces --
 *
 *     {"trackId":null,"error":"Estructura del archivo XML inválida. ",
 *      "mensaje":"The element 'Totales' has invalid child element 'MontoExento'..."}
 *
 * -- y la consulta la leyo "En Proceso" durante 13 dias, hasta que se emitio una
 * segunda nota por la misma factura. La DGII no la tenia ("No fue encontrada la
 * factura", consultado el 2026-09-16).
 *
 * `desenlaceEnvio` importa `estadoEnvio`, asi que la lista no podia bajar ahi
 * sin crear un ciclo, y copiarla es como se desincronizaron las tres lecturas
 * del estado que ya hubo. Una sola lista, dos lectores.
 */
export const MARCAS_RECHAZO: Array<[RegExp, string]> = [
  [/\bno\s+acept/i, 'dice "no aceptado"'],
  [/rechaz/i, 'dice "rechazado"'],
  [/\brejected\b/i, 'dice "rejected"'],
  // El validador XSD de la DGII. Es la forma de rechazo mas comun y la que
  // recibio esta empresa en su primer e-44:
  //   "The element 'IdDoc' has invalid child element 'IndicadorMontoGravado'".
  [/has invalid child element/i, 'el validador nombra un elemento invalido'],
  [/is not valid according to its datatype/i, 'el validador rechaza un tipo de dato'],
  [/the element .* is invalid/i, 'el validador declara invalido un elemento'],
  // mSeller lo dice con sus propias palabras cuando el XSD no valida. El
  // acento importa: el texto real es "invalida" CON tilde, y un patron sin
  // ella no casa. Se admiten las dos formas porque el mensaje viene del
  // proveedor y no hay garantia de como lo escriba.
  [/estructura del archivo xml inv[aá]lid/i, 'mSeller dice que la estructura del XML no vale'],
];

/** La marca que identifica `texto` como rechazo, o `null` si no lleva ninguna. */
export function marcaDeRechazo(texto: string): string | null {
  for (const [patron, marca] of MARCAS_RECHAZO) {
    if (patron.test(texto)) return marca;
  }
  return null;
}
