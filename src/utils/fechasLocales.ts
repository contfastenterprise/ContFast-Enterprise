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

// ---------------------------------------------------------------------------
// El dia de REPUBLICA DOMINICANA
// ---------------------------------------------------------------------------
//
// Vivia en `services/avisos/vencimientos.ts` (lote 158). Subio aqui en el lote
// 174 porque el panel lo necesita igual: `biRepository` calculaba "hoy" con
// `new Date().toISOString()`, que es el dia UTC, y el servidor de Vercel corre
// en UTC. Resultado: a partir de las 20:00 hora de RD el dia UTC ya es el
// siguiente, y "Ventas de hoy" perdia la jornada entera y solo contaba lo
// vendido despues de esa hora.
//
// `getLocalDateString` no sirve para esto: usa los captadores locales del
// proceso, que en Vercel son UTC. El dia de un negocio dominicano no depende
// de donde este el servidor.

/** Republica Dominicana no cambia la hora en todo el año: siempre UTC-4. */
export const DESFASE_RD_MS = 4 * 60 * 60 * 1000;

/** El dia (aaaa-mm-dd) en hora de RD que corresponde a un instante. */
export function diaRD(instante: Date | string = new Date()): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - DESFASE_RD_MS).toISOString().slice(0, 10);
}

/** El dia de RD sumandole dias enteros. */
export function diaRDMas(instante: Date | string, dias: number): string {
  const base = diaRD(instante);
  if (!base) return '';
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El primer dia del mes de RD al que pertenece un instante. */
export const primerDiaDelMesRD = (instante: Date | string = new Date()): string =>
  `${diaRD(instante).slice(0, 7)}-01`;

/** El primer dia del año de RD al que pertenece un instante. */
export const primerDiaDelAnoRD = (instante: Date | string = new Date()): string =>
  `${diaRD(instante).slice(0, 4)}-01-01`;

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

/**
 * La fecha que LEE UNA PERSONA: dd-MM-aaaa.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE HAY QUE PASAR POR AQUI Y NO LLAMAR A `toLocaleDateString`
 * ─────────────────────────────────────────────────────────────────────────
 * Medido en el barrido: 147 sitios pintaban fechas con
 * `new Date(algo).toLocaleDateString('es-DO')`, y de ellos 61 recibian una
 * columna `date` -- o sea la cadena 'AAAA-MM-DD'. `new Date` la lee como
 * MEDIANOCHE UTC, que en Republica Dominicana son las 20:00 del dia
 * ANTERIOR, asi que esos 61 sitios enseñaban un dia menos: vencimientos de
 * CxC y CxP, periodos de nomina, fechas de cheques.
 *
 * Y ademas `toLocaleDateString('es-DO')` NO rellena con ceros:
 *
 *     new Date(2026, 8, 2).toLocaleDateString('es-DO')   ->  "2/9/2026"
 *
 * Asi que convivian cinco formatos distintos en la misma aplicacion.
 *
 * Aqui no se construye ningun `Date` para la fecha: `diaDe` corta la cadena
 * cuando es una cadena y usa los captadores locales cuando es un instante
 * real. Esa es la propiedad que hay que conservar si alguien toca esto.
 *
 * Lo ilegible se devuelve TAL CUAL en vez de taparse con un guion. Un dato
 * raro que se ve es un dato que alguien puede arreglar; uno tapado, no.
 */
export function formatDateDisplay(valor: string | Date | null | undefined): string {
  const dia = diaDe(valor);
  if (dia) return `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`;
  if (typeof valor === 'string' && valor.trim() !== '') return valor;
  return '-';
}

/**
 * La hora local de un instante, 'hh:mm' en 24 horas. `null` si no hay hora
 * que leer.
 *
 * Solo la tiene una MARCA DE TIEMPO. Una columna `date` es un dia, no un
 * instante: no hay hora que enseñar y fabricar "00:00" seria inventarla.
 */
function horaDe(valor: string | Date | null | undefined): string | null {
  const d = valor instanceof Date
    ? valor
    : (typeof valor === 'string' && valor.includes('T') ? new Date(valor) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Solo la hora, 'hh:mm' en 24 horas. `'-'` si no hay hora que enseñar.
 *
 * La usan las pantallas que ya tienen la fecha en otra columna -- la caja, el
 * panel de sesiones -- y solo necesitan la hora. Antes era
 * `toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })`, que
 * en RD da "02:05 a. m.": el "a. m." ocupa sitio sin decir nada que las 24
 * horas no digan, y en una tabla estrecha es justo lo que sobra.
 *
 * Un dia sin hora da `'-'`, no "00:00": una columna `date` no tiene hora y
 * fabricar una medianoche seria inventarla.
 */
export function formatTimeDisplay(valor: string | Date | null | undefined): string {
  return horaDe(valor) ?? '-';
}

/**
 * Fecha y hora: 'dd-MM-aaaa hh:mm'.
 *
 * Sustituye a `new Date(x).toLocaleString('es-DO')`, que daba
 * "2/9/2026, 12:00:00 a. m.": sin relleno, con segundos que en un listado
 * son ruido, y con un "a. m." que ocupa sitio sin decir nada que las 24
 * horas no digan.
 *
 * Si lo que llega es un dia sin hora, devuelve solo la fecha. No se inventa
 * una medianoche que nadie ha medido.
 */
export function formatDateTimeDisplay(valor: string | Date | null | undefined): string {
  const fecha = formatDateDisplay(valor);
  if (fecha === '-') return fecha;
  const hora = horaDe(valor);
  return hora ? `${fecha} ${hora}` : fecha;
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

const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Bisiesto de verdad: 2000 lo es, 1900 no. La regla de los 400 no es un adorno. */
const esBisiesto = (anio: number): boolean =>
  (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/**
 * `true` solo si 'AAAA-MM-DD' es un dia que EXISTE en el calendario.
 *
 * Un 31 de febrero no es una fecha con un problema de formato: es una fecha
 * que no existe. La diferencia importa porque la forma se valida con una
 * expresion regular y la existencia no: `/^\d{4}-\d{2}-\d{2}$/` deja pasar
 * '2026-02-31' y '2026-13-01' enteras.
 *
 * No construye ningun `Date`, y esa es la propiedad que hay que conservar:
 * `new Date(2026, 1, 31)` NO falla -- se convierte en el 3 de marzo. Validar
 * con `Date` es pedirle que normalice justo lo que estamos buscando.
 */
export function esDiaReal(dia: string | null | undefined): boolean {
  if (typeof dia !== 'string') return false;
  const m = dia.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const aaaa = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12) return false;
  const tope = mm === 2 && esBisiesto(aaaa) ? 29 : DIAS_DEL_MES[mm - 1];
  return dd >= 1 && dd <= tope;
}

/**
 * El ultimo dia de un periodo 'AAAA-MM', como 'AAAA-MM-DD'. `null` si el
 * periodo no tiene esa forma o el mes no existe.
 *
 * Existe porque el 606 cerraba el mes en el dia 31 a pelo
 * (`${year}-${month}-31`) y lo comparaba con `expenses.issue_date`, que es
 * columna `date`. En abril, junio, septiembre, noviembre y febrero ese literal
 * no es una fecha: Postgres no devuelve menos filas, RECHAZA LA CONSULTA
 * ENTERA con "date/time field value out of range". Comprobado contra la base
 * el 2026-09-15.
 *
 * Tampoco se arma con `Date`, por lo mismo que `esDiaReal`: la otra forma de
 * escribirlo, `new Date(anio, mes, 0)`, da el ultimo dia en la hora LOCAL, y
 * al pasarlo por `toISOString()` se corre un dia en cualquier huso al este de
 * Greenwich. Aqui no hay husos.
 */
export function ultimoDiaDelMes(periodo: string | null | undefined): string | null {
  if (typeof periodo !== 'string') return null;
  const m = periodo.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const aaaa = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  const tope = mm === 2 && esBisiesto(aaaa) ? 29 : DIAS_DEL_MES[mm - 1];
  return `${m[1]}-${m[2]}-${String(tope).padStart(2, '0')}`;
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
