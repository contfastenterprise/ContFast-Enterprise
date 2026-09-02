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
 * `TesteCF`, `CerteCF` y `eCF` son endpoints distintos, y equivocarse manda el
 * comprobante a la DGII equivocada.
 *
 * Habia CUATRO copias de esta funcion, tres de ellas resolviendo el entorno
 * solo por `companySettings.dgiiEnv` sin mirar el modo de la operacion. Se
 * unificaron aqui.
 *
 * ─── POR QUE YA NO SE MIRA `dgii_env` ──────────────────────────────────────
 *
 * Porque eran DOS interruptores para UNA decision, y podian contradecirse.
 * Lo hacian: `modo = PRODUCCION` con `dgii_env = 'test'` daba datos reales con
 * presentacion de ensayo. Y lo resolvia en silencio hacia pruebas, porque el
 * valor 'test' no coincidia con ninguna rama y caia en un `return 'TesteCF'`
 * final. La factura volvia "Aceptado", con su codigo de seguridad, sin un solo
 * error visible -- pero de TesteCF.
 *
 * Ese modo de fallar no se arregla eligiendo mejor el valor por defecto: se
 * arregla quitando el segundo interruptor. Ahora el modo del sistema decide, y
 * la correspondencia es uno a uno. Una contradiccion entre modo y ambiente ya
 * no se puede escribir.
 *
 * ─── EL MODO DESCONOCIDO NO TIENE VALOR POR DEFECTO ────────────────────────
 *
 * Un modo que no este en la tabla LANZA. Es deliberado y va contra la
 * tentacion de "ante la duda, pruebas": un valor por defecto silencioso es
 * justo lo que hizo que los comprobantes de produccion se fueran a TesteCF sin
 * que nadie lo notara. Si aparece un modo que este fichero no conoce, el
 * sistema tiene que pararse y decirlo, no elegir por su cuenta.
 */

/**
 * Los modos del sistema. `CERTIFICACION` existe en la base desde la 0046 pero
 * TODAVIA NO esta soportado por el resto del sistema: 133 declaraciones de tipo
 * en 45 ficheros siguen fijando `'PRODUCCION' | 'PRUEBA'`, y 14 comparaciones
 * tratan como produccion todo lo que no sea PRUEBA. Hasta que eso se complete,
 * el modo no se ofrece en ninguna interfaz.
 */
export type ModoSistema = 'PRODUCCION' | 'PRUEBA' | 'CERTIFICACION';

export type EntornoDgii = 'TesteCF' | 'CerteCF' | 'eCF';

/**
 * Un modo, un ambiente. La tabla ES la regla: no hay ramas que leer ni orden
 * de comparaciones del que dependa el resultado.
 */
const AMBIENTE_DE_MODO: Record<ModoSistema, EntornoDgii> = {
  PRUEBA: 'TesteCF',
  CERTIFICACION: 'CerteCF',
  PRODUCCION: 'eCF',
};

/**
 * El ambiente de la DGII para una operacion, a partir de su modo.
 *
 * @param modo El modo de la operacion. Es lo unico que decide.
 */
export function entornoDgii(modo: ModoSistema): EntornoDgii {
  const entorno = AMBIENTE_DE_MODO[modo];

  if (!entorno) {
    throw new Error(
      `Modo de sistema desconocido: ${JSON.stringify(modo)}. ` +
      'No se elige ambiente de la DGII por defecto: hay que corregir el modo. ' +
      `Los validos son ${Object.keys(AMBIENTE_DE_MODO).join(', ')}.`
    );
  }

  return entorno;
}

/** Para mostrar en pantalla. No decide nada. */
export const NOMBRE_ENTORNO: Record<EntornoDgii, string> = {
  TesteCF: 'Pruebas',
  CerteCF: 'Certificación',
  eCF: 'Producción',
};
