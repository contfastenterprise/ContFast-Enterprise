/**
 * En que entorno de la DGII habla el sistema: pruebas, certificacion o real.
 *
 * ─── POR QUE EXISTE (hallazgo ISO-13) ──────────────────────────────────────
 *
 * `entorno` no es una etiqueta: es un SEGMENTO DE LA URL con la que se habla
 * con mSeller.
 *
 *     ${baseUrl}/${entorno}/documentos-ecf
 *
 * `TesteCF` y `eCF` son endpoints distintos, y equivocarse manda el comprobante
 * a la DGII equivocada.
 *
 * Habia CUATRO copias de esta funcion. Tres identicas -- en `jobRunners` y en
 * las dos rutas de consulta de estado -- que resolvian el entorno unicamente a
 * partir de `companySettings.dgiiEnv`, un ajuste de EMPRESA, sin mirar el modo
 * de la operacion. Y una cuarta, dentro de `invoiceSubmissionService`, que si
 * miraba el modo: era la unica correcta, y ademas perdia el caso de
 * certificacion.
 *
 * Con `dgiiEnv = 'production'`, pulsar "Reenviar" estando en modo PRUEBA
 * mandaba el comprobante a la DGII DE VERDAD, con un NCF de la secuencia de
 * pruebas. El camino de la cola tenia el modo en la mano -- lo lee de la propia
 * factura y lo usa para elegir la secuencia -- y no lo pasaba al entorno.
 *
 * ─── LA REGLA ──────────────────────────────────────────────────────────────
 *
 * EL MODO MANDA POR ENCIMA DE LA CONFIGURACION. Nunca al reves.
 *
 * La asimetria es deliberada: equivocarse hacia pruebas cuesta un reenvio y se
 * arregla en un minuto. Equivocarse hacia produccion cuesta un comprobante
 * fiscal emitido de verdad, que ya no se puede retirar -- solo anular con otro
 * comprobante. Cuando una de las dos equivocaciones es reversible y la otra no,
 * el valor por defecto se elige solo.
 */

export type ModoSistema = 'PRODUCCION' | 'PRUEBA';
export type EntornoDgii = 'TesteCF' | 'CerteCF' | 'eCF';

/**
 * @param modo     El de la operacion. Si es PRUEBA, no se consulta nada mas.
 * @param dgiiEnv  `companySettings.dgiiEnv`. Solo decide cuando el modo es
 *                 PRODUCCION. Se aceptan los valores que ya usaban las cuatro
 *                 copias anteriores, para no romper ninguna configuracion viva.
 */
export function entornoDgii(modo: ModoSistema, dgiiEnv?: string | null): EntornoDgii {
  // Primero el modo, y sin excepciones. Un comprobante de practicas no puede
  // llegar a la DGII real por mucho que la empresa este configurada en
  // produccion.
  if (modo === 'PRUEBA') return 'TesteCF';

  if (dgiiEnv === 'production' || dgiiEnv === '1') return 'eCF';
  if (dgiiEnv === 'cert' || dgiiEnv === 'certification') return 'CerteCF';

  // Sin configuracion, o con una que no se reconoce: pruebas. El silencio no
  // puede leerse como permiso para emitir de verdad.
  return 'TesteCF';
}
