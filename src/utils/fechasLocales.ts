/**
 * Fechas en formato local (YYYY-MM-DD) sin pasar por UTC.
 *
 * Vivian como funciones sueltas dentro de dashboard/purchases/page.tsx. Al
 * sacar GuaranteeChecksView a su propio archivo (auditoria P2-38, piloto de
 * partir las paginas grandes) las necesitaban los dos, y duplicarlas era
 * crear la tercera copia de lo mismo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE `new Date('2026-09-30')` NO SIRVE PARA UNA FECHA SIN HORA
 * ─────────────────────────────────────────────────────────────────────────
 * Porque JavaScript la lee como MEDIANOCHE UTC. En Republica Dominicana
 * (UTC-4) eso es el dia 29 a las 20:00, y a partir de ahi todo sale corrido:
 *
 *     new Date('2026-09-30').toLocaleDateString('es-DO')   ->  "29/9/2026"
 *
 * El apano habitual -- `d.setHours(0,0,0,0)` -- no lo arregla: fija la
 * medianoche del dia EQUIVOCADO. Medido en la auditoria: las tablas de CxC y
 * CxP pintaban todos los vencimientos un dia antes, marcaban las facturas
 * vencidas 24 horas antes de tiempo, e inflaban el atraso en un dia. Los
 * tramos de antiguedad del servidor, igual.
 *
 * Las columnas `date` de Postgres llegan por drizzle como la cadena
 * 'AAAA-MM-DD' (sin `mode: 'date'`, `date()` devuelve texto), asi que la fecha
 * correcta YA ESTA AHI: convertirla a `Date` es lo que la rompe.
 *
 * La cura es no construir ningun `Date` para comparar dias: quedarse con los
 * diez primeros caracteres y contar dias sobre eso. `formatDateDisplay` ya lo
 * hacia asi; el resto del sistema no se habia enterado.
 *
 * Una MARCA DE TIEMPO (`timestamp`, un `createdAt`) es otra cosa: ahi el
 * instante es real y `new Date(...)` con los captadores locales es lo
 * correcto. Para eso esta `diaDe`, que acepta las dos formas.
 */

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFirstDayOfMonthString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

/**
 * El dia 'AAAA-MM-DD' de cualquier cosa que traiga una fecha.
 *
 * - Una CADENA ('2026-09-30', o un ISO completo) se corta, no se interpreta:
 *   los diez primeros caracteres ya son el dia que la base guardo.
 * - Un `Date` es una marca de tiempo real: ahi si valen los captadores
 *   locales, porque el instante ocurrio en algun sitio a alguna hora.
 *
 * Devuelve `null` si no hay nada que leer, para que quien llame decida que
 * hacer en vez de recibir una fecha inventada.
 */
export function diaDe(valor: string | Date | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : getLocalDateString(valor);
  }
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** El numero de serie de un dia 'AAAA-MM-DD'. UTC en los dos lados: el huso se cancela. */
const serie = (dia: string): number =>
  Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));

/**
 * Dias enteros de `desde` a `hasta`, los dos como 'AAAA-MM-DD'.
 * Positivo si `hasta` es posterior. Sin husos horarios y sin horas de por medio.
 */
export function diasEntreDias(desde: string, hasta: string): number {
  return Math.round((serie(hasta) - serie(desde)) / 86400000);
}

/** Hoy, como dia local. */
export const hoyDia = (): string => getLocalDateString();

/**
 * Dias de ATRASO de un vencimiento. Cero el mismo dia del vencimiento y antes.
 *
 * El dia en que algo vence todavia NO esta vencido: se puede pagar ese dia.
 * Ese es justo el dia que el codigo anterior contaba ya como uno de atraso.
 */
export function diasDeAtraso(vencimiento: string | Date | null | undefined, hoy: string = hoyDia()): number {
  const dia = diaDe(vencimiento);
  if (!dia) return 0;
  return Math.max(0, diasEntreDias(dia, hoy));
}

/** `true` solo a partir del dia SIGUIENTE al vencimiento. */
export function estaVencida(vencimiento: string | Date | null | undefined, hoy: string = hoyDia()): boolean {
  return diasDeAtraso(vencimiento, hoy) > 0;
}

/**
 * Dias transcurridos desde la emision. Es la ANTIGUEDAD del documento, que no
 * es lo mismo que el atraso: una factura de hace 90 dias con 30 de credito
 * tiene 90 de antiguedad y 60 de atraso. Llamar "dias vencidos" a la
 * antiguedad -- como hacia la tabla de CxC -- infla el atraso en todo el
 * plazo de credito.
 */
export function diasDeAntiguedad(emision: string | Date | null | undefined, hoy: string = hoyDia()): number {
  const dia = diaDe(emision);
  if (!dia) return 0;
  return Math.max(0, diasEntreDias(dia, hoy));
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * '30 sep', para sitios estrechos como las tarjetas del kanban.
 *
 * Se arma con los trozos del dia, no con `toLocaleDateString`, por lo mismo de
 * siempre: `toLocaleDateString` necesita un `Date`, y construirlo es lo que
 * corre la fecha un dia.
 */
export function formatDateShort(valor: string | Date | null | undefined): string {
  const dia = diaDe(valor);
  if (!dia) return '-';
  return `${Number(dia.slice(8, 10))} ${MESES_CORTOS[Number(dia.slice(5, 7)) - 1]}`;
}
