/**
 * El motivo de verdad de un error, incluida la causa que lo envuelve.
 *
 * DE DONDE SALE (lote 197)
 * ------------------------
 * El 2026-09-25, leyendo los registros de PRODUCCION mientras el dueño recargaba:
 *
 *     🚫 GET /api/v1/dashboard
 *     ERROR "Error fetching dashboard data:"
 *       message: "Failed query: select \"id\", \"ncf\", ... from \"invoices\" ..."
 *
 * El panel de produccion devuelve 500 -- y con el se cae el envio de los avisos por
 * WhatsApp, que vive en esa misma ruta (lote 178). Pero el mensaje **no dice que
 * paso**: "Failed query" es el envoltorio de Drizzle, y el error de verdad
 * (`CONNECTION_CLOSED`, `too many clients`, `timeout`, un tipo que no cuadra) viaja
 * en `error.cause`, que nadie leia. Medido de paso: esa consulta **funciona sola**
 * (10 filas, 928 ms), y el 500 llego 20 ms despues de la peticion vecina -- o sea
 * que no es la consulta, es algo de la conexion. Sin la causa no se puede afirmar
 * cual.
 *
 * Es el mismo defecto que el lote 196 cerro en los avisos de WhatsApp, en otro
 * sitio: **el dato que explica el fallo se descarta al registrarlo**. Y la leccion
 * del 185: un log que no señala al sitio correcto cuesta una investigacion entera.
 *
 * DOS SALIDAS, A PROPOSITO
 * ------------------------
 *  · `motivoDelError` -- la cadena completa, para el REGISTRO del servidor.
 *  · `motivoParaLaPantalla` -- solo la causa mas profunda, para lo que se le manda
 *    al navegador. La causa mas honda es a la vez la mas informativa y la menos
 *    indiscreta: el SQL que fallo esta en el mensaje de FUERA (el de Drizzle), asi
 *    que quedarse con el nucleo deja de mandarle la consulta al cliente -- que es
 *    lo que se hace hoy, porque la pantalla pinta `error.message` tal cual.
 *
 * Fichero puro y sin imports: tiene que poder ejecutarse en un banco.
 */

/** Tope por tramo y tope total, para que un registro no se coma la pantalla. */
const TOPE_TRAMO = 160;
const TOPE_TOTAL = 400;
/** Hasta donde se sigue la cadena de causas. Mas que esto no aclara nada. */
const HONDURA = 5;

const recortar = (t: string, tope: number) => {
  const limpio = t.replace(/\s+/g, ' ').trim();
  return limpio.length > tope ? `${limpio.slice(0, tope)}…` : limpio;
};

/**
 * Un eslabon de la cadena: su codigo (si lo trae) y su mensaje.
 *
 * EL CODIGO ES LO QUE MAS IMPORTA y por eso va delante: `CONNECTION_CLOSED` de
 * postgres.js o un `53300` de PostgreSQL dicen en una palabra lo que el mensaje
 * cuenta en tres lineas, y son lo que se puede buscar.
 */
function eslabon(e: unknown): string {
  if (e === null || e === undefined) return '';
  if (typeof e === 'string') return recortar(e, TOPE_TRAMO);
  if (typeof e !== 'object') return recortar(String(e), TOPE_TRAMO);

  const o = e as { code?: unknown; message?: unknown; name?: unknown };
  const codigo = typeof o.code === 'string' || typeof o.code === 'number' ? String(o.code) : '';
  const mensaje = typeof o.message === 'string' ? o.message : '';

  if (codigo === '' && mensaje === '') {
    //  Ni codigo ni mensaje: al menos su nombre, y si tampoco, el objeto.
    const nombre = typeof o.name === 'string' ? o.name : '';
    if (nombre !== '') return nombre;
    try {
      return recortar(JSON.stringify(e), TOPE_TRAMO);
    } catch {
      //  Referencias circulares: no se puede serializar, y no pasa nada.
      return 'error sin mensaje';
    }
  }
  if (codigo === '') return recortar(mensaje, TOPE_TRAMO);
  if (mensaje === '') return codigo;
  return `${codigo}: ${recortar(mensaje, TOPE_TRAMO)}`;
}

/** La cadena de errores, del de fuera al de dentro. Nunca lanza. */
function cadena(err: unknown): string[] {
  const partes: string[] = [];
  //  Contra una cadena circular (`a.cause = b; b.cause = a`), que existe: sin esto
  //  seria un bucle infinito en el camino de un `catch`.
  const vistos = new Set<unknown>();
  let actual: unknown = err;
  for (let i = 0; i < HONDURA && actual !== null && actual !== undefined; i += 1) {
    if (typeof actual === 'object' && vistos.has(actual)) break;
    if (typeof actual === 'object') vistos.add(actual);
    const texto = eslabon(actual);
    //  Un eslabon que repite lo mismo que el anterior no aporta.
    if (texto !== '' && texto !== partes[partes.length - 1]) partes.push(texto);
    actual = (actual as { cause?: unknown })?.cause;
  }
  return partes;
}

/**
 * La cadena completa, para el registro del servidor.
 *
 * Se lee de fuera adentro, con flechas: lo primero es lo que se rompio y lo ultimo
 * es por que.
 */
export function motivoDelError(err: unknown): string {
  const partes = cadena(err);
  if (partes.length === 0) return 'error sin motivo';
  return recortar(partes.join(' ← '), TOPE_TOTAL);
}

/**
 * El nucleo del error, para lo que ve quien esta delante de la pantalla.
 *
 * La causa mas profunda es la que explica el fallo, y de paso **deja fuera el SQL**:
 * la consulta que fallo esta en el mensaje del envoltorio de Drizzle, no en el
 * nucleo. Hoy la pantalla pinta el mensaje entero, asi que esto ademas deja de
 * mandarle la consulta al navegador.
 */
export function motivoParaLaPantalla(err: unknown): string {
  const partes = cadena(err);
  if (partes.length === 0) return 'error sin motivo';
  return recortar(partes[partes.length - 1], TOPE_TRAMO);
}
