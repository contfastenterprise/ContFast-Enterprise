/**
 * Cada cuanto se le vuelve a preguntar a mSeller por el veredicto.
 *
 * POR QUE ESTO VIVE SOLO, EN SU PROPIO FICHERO
 * --------------------------------------------
 * Es una POLITICA -- unos numeros y una regla -- y el que la usa
 * (`perseguirVeredicto`) es un MECANISMO que necesita la base de datos, la
 * cola y un cliente de mSeller. Juntos, comprobar los numeros obligaria a
 * levantar todo eso; separados, el banco los corre tal cual.
 *
 * LOS NUMEROS
 * -----------
 *     2s · 4s · 8s · 15s · 30s · 60s · 120s · 300s
 *
 * Ocho intentos en algo mas de ocho minutos, apretados al principio. Se empieza
 * a los DOS segundos porque es lo que se pidio y porque es el momento en que ya
 * puede haber veredicto: mSeller devuelve la firma en el acto, y el dictamen de
 * la DGII suele venir detras en segundos.
 *
 * Crecen porque preguntar cada dos segundos durante ocho minutos serian 240
 * consultas por factura, y en caja hay una factura detras de otra. Lo que no se
 * resuelva en esta escalera no es urgente: se queda para el barrido de siempre.
 */
export const ESCALERA_MS: readonly number[] = [
  2_000, 4_000, 8_000, 15_000, 30_000, 60_000, 120_000, 300_000,
];

/**
 * El hueco que toca antes del intento numero `intento` (empezando en 0), o
 * `null` si la escalera se acabo.
 */
export function huecoDelIntento(intento: number): number | null {
  //  MUTANTE EQUIVALENTE, A SABIENDAS: quitar esta guarda no cambia nada.
  //  `ESCALERA_MS[-1]` y `ESCALERA_MS[1.5]` ya devuelven `undefined` en
  //  JavaScript, asi que el `return null` de abajo hace el mismo trabajo. Se
  //  queda porque dice en voz alta que un intento negativo o roto no es un
  //  caso valido, y porque el dia que esto deje de ser un array -- un Map, una
  //  tabla -- la guarda sera lo unico que impida un resultado absurdo.
  if (!Number.isInteger(intento) || intento < 0) return null;
  const hueco = ESCALERA_MS[intento];
  return hueco == null ? null : hueco;
}

/** Cuanto cubre la escalera entera, en milisegundos. */
export function alcanceTotalMs(): number {
  return ESCALERA_MS.reduce((a, b) => a + b, 0);
}
