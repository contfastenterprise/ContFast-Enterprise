/**
 * Cuanto se espera a mSeller. Un solo sitio, y configurable.
 *
 * EL FALLO
 * --------
 * `sendDocument` abortaba a los 12 segundos. Esa llamada no es un ping: mSeller
 * firma el e-CF y lo transmite a la DGII, y devuelve el veredicto. La DGII
 * tarda lo que tarda -- 15, 20, 30 segundos en horas cargadas es normal -- asi
 * que 12 segundos no es un margen, es una loteria.
 *
 * Y perder esa carrera no deja las cosas como estaban. Medido en
 * `scratch/reproducir_mseller.ts` con un mSeller de mentira que contesta a los
 * 14 s: el cliente aborta a los 12.009 s, devuelve "timeout", y el documento
 * SI se proceso al otro lado. A partir de ahi:
 *
 *   - el mensaje lleva "timeout", asi que cuenta como error de comunicacion
 *   - el usuario ve "¿desea emitir localmente?" y acepta
 *   - se reenvia el MISMO NCF de un e-CF que la DGII pudo haber aceptado ya
 *   - y el codigo de seguridad que venia en la respuesta perdida no llega
 *     nunca, asi que al imprimir se fabricaba uno (ver codigoSeguridad.ts)
 *
 * O sea que el limite corto no causaba una espera incomoda: causaba envios
 * duplicados y comprobantes con un codigo inventado.
 *
 * LOS VALORES
 * -----------
 * Se separan por lo que hace cada llamada, que no es lo mismo:
 *
 *   AUTENTICACION  no depende de la DGII, solo de mSeller. 8 s basta y sobra;
 *                  se deja como estaba, y se cuenta DENTRO del envio.
 *   ENVIO          firma + transmision + veredicto de la DGII. Es la unica que
 *                  espera a un tercero. Aqui estaba el problema.
 *   CONSULTA       preguntar por un estado ya calculado. Rapida.
 *
 * OJO CON LA PLATAFORMA
 * ---------------------
 * Subir este numero no sirve de nada por si solo si la funcion de Vercel se
 * corta antes. Por eso la ruta de emision declara su propio `maxDuration`. Si
 * se sube ENVIO por encima de ese `maxDuration`, la plataforma corta primero y
 * el cliente ni se entera de que aborto: hay que subir los dos.
 */

/** Lee un entero de entorno dentro de unos limites; fuera de ellos, el valor por defecto. */
function msDeEntorno(nombre: string, porDefecto: number, min: number, max: number): number {
  const crudo = process.env[nombre];
  if (crudo == null || String(crudo).trim() === '') return porDefecto;
  const n = Number(crudo);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    console.warn(
      `[tiempos] ${nombre}="${crudo}" no es un entero entre ${min} y ${max}; se usa ${porDefecto}.`
    );
    return porDefecto;
  }
  return n;
}

/** Autenticacion contra mSeller. No espera a la DGII. */
export const MS_AUTENTICACION = msDeEntorno('MSELLER_TIMEOUT_AUTH_MS', 8_000, 1_000, 60_000);

/**
 * Envio del e-CF: firma, transmision a la DGII y veredicto.
 *
 * 45 s por defecto. El tope de la ruta (`maxDuration = 60`) deja margen para la
 * autenticacion previa y para escribir la factura despues.
 */
export const MS_ENVIO = msDeEntorno('MSELLER_TIMEOUT_ENVIO_MS', 45_000, 5_000, 120_000);

/** Consulta de estado, individual o por lotes. */
export const MS_CONSULTA = msDeEntorno('MSELLER_TIMEOUT_CONSULTA_MS', 15_000, 1_000, 60_000);

/**
 * Segundos que la funcion de emision puede durar en Vercel.
 *
 * Sin declararlo, la plataforma aplica su valor por defecto (del orden de 15 s),
 * y entonces da igual lo que diga MS_ENVIO. Se exporta desde aqui para que el
 * numero de la ruta y el del cliente se lean juntos y no se separen con el
 * tiempo.
 */
export const SEGUNDOS_MAXIMOS_EMISION = 60;
