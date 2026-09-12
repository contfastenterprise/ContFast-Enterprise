/**
 * La antiguedad de un empleado, calculada en UN sitio.
 *
 * POR QUE EXISTE
 * --------------
 * La misma cuenta estaba hecha TRES veces y ninguna coincidia con las otras:
 *
 *   1. `payrollCalculationService.calculateSettlement` -- los meses de servicio,
 *      que deciden los tramos de preaviso y cesantia.
 *   2. `api/v1/hr/settlements/route.ts` -- los dias trabajados en el año, que
 *      alimentan la regalia (`accumulatedNavidadBase`).
 *   3. `dashboard/hr/settlements/page.tsx` -- la misma cuenta que la 2, para
 *      pintarla ANTES de guardar.
 *
 * Medido con las mismas fechas en las dos ultimas: SEIS de seis casos daban
 * cifras distintas. Lo que el usuario veia en pantalla no era lo que se
 * guardaba, y la diferencia no era de redondeo: la pantalla contaba el dia de
 * salida y el servidor no.
 *
 * EL FALLO DEL 1 DE ENERO
 * -----------------------
 * `hire_date` y `termination_date` son columnas `date`: llegan como la cadena
 * 'AAAA-MM-DD'. `new Date('2026-01-01')` es medianoche UTC, y leida con
 * `getFullYear()` en RD (UTC-4) son las 20:00 del 31 de diciembre de 2025.
 *
 * Asi que la ruta hacia `new Date(term.getFullYear(), 0, 1)` y le salia el 1 de
 * enero de **2025**. Una liquidacion con salida el 1 de enero acumulaba un AÑO
 * ENTERO de salario devengado en vez de cero: con un sueldo de 40.000, la
 * regalia salia 40.021 en vez de 0.
 *
 * Un dia antes o un dia despues, bien. Se barrieron 336 fechas de salida y solo
 * fallaba esa.
 *
 * Y EL RESTO DEL AÑO SALIA BIEN POR ACCIDENTE
 * -------------------------------------------
 * Esto es lo que de verdad daba miedo. `startOfCurrentYear` era medianoche
 * LOCAL (04:00 UTC) y `term` medianoche UTC, asi que la resta salia cuatro horas
 * corta -- y el `Math.ceil` la redondeaba hacia arriba y devolvia el numero
 * bueno. El desajuste de husos estaba entero; lo tapaba un `ceil` que nadie
 * habia puesto para eso. El dia que alguien lo cambiara por un `round`, se
 * rompian los 365 dias del año a la vez.
 *
 * Aqui no se resta ninguna hora: se restan DIAS de calendario, con `Date.UTC` a
 * los dos lados, asi que el huso se cancela y no hay nada que un redondeo tenga
 * que tapar.
 *
 * EL DIA DE SALIDA NO CUENTA
 * --------------------------
 * Decidido con el usuario: contratado el 1 y salida el 1 son CERO dias. Es lo
 * que el servidor ya guardaba, asi que ninguna liquidacion ya emitida cambia de
 * cifra. La pantalla llevaba un `+1` y era ella la que estaba de mas.
 *
 * EL PERIODO ES UN INTERVALO SEMIABIERTO, Y ESO NO ES UN DETALLE
 * -------------------------------------------------------------
 * "El dia de salida no cuenta" aplicado a secas al 31 de diciembre daria 364
 * dias para quien trabajo el año entero -- 11,97 meses en vez de 12 -- y eso
 * seria bajarle la regalia a TODA la plantilla, que no es lo que se decidio.
 *
 * El 31 de diciembre no es una salida: es que el año se acabo. Asi que el
 * periodo se cuenta como [desde, hasta), donde `hasta` es o bien el dia en que
 * la persona se fue -- que no trabajo -- o bien el 1 de enero del año
 * siguiente, que todavia no ha trabajado. Con eso:
 *
 *   - año entero trabajando  -> [01-01, 01-01 del siguiente) = 365 dias
 *   - salida el 1 de enero   -> [01-01, 01-01)               = 0 dias
 *   - salida el 30 de junio  -> [01-01, 06-30)               = 180 dias
 *
 * Las tres son las cifras que el sistema ya daba, menos la del 1 de enero, que
 * es justo la que estaba mal.
 */
import { diaDe, diasEntreDias } from '@/utils/fechasLocales';

/**
 * El año de una fecha solo-dia, sin pasar por `new Date`.
 *
 * `new Date('2026-01-01').getFullYear()` da 2025 en RD. Aqui se lee del texto,
 * que es lo que la columna `date` trae de verdad.
 */
export function anioDe(fecha: string | Date | null | undefined): number | null {
  const dia = diaDe(fecha);
  return dia ? Number(dia.slice(0, 4)) : null;
}

/**
 * Dias trabajados dentro de UN año natural.
 *
 * Es lo que alimenta la regalia: el salario devengado en el año se reparte en
 * doceavas partes. Entra por el 1 de enero o por la fecha de alta, la que sea
 * posterior; y sale por la fecha de baja o por el fin del año, la que sea
 * anterior.
 *
 * `salida` vacia significa que sigue trabajando.
 *
 * Devuelve 0 -- y no un negativo -- si la baja es anterior al alta, que es dato
 * malo y no un caso a calcular.
 */
export function diasTrabajadosEnAnio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined,
  anio: number
): number {
  const alta = diaDe(entrada);
  if (!alta) return 0;

  const primeroDelAnio = `${anio}-01-01`;
  // El limite superior es ABIERTO: el 1 de enero del año siguiente todavia no
  // se ha trabajado, igual que no se trabaja el dia en que uno se va.
  const finDelAnio = `${anio + 1}-01-01`;

  const baja = diaDe(salida);
  const desde = alta > primeroDelAnio ? alta : primeroDelAnio;
  const hasta = baja && baja < finDelAnio ? baja : finDelAnio;

  return Math.max(0, diasEntreDias(desde, hasta));
}

/**
 * Lo mismo, en el año en que la persona se fue. Es el caso de la liquidacion.
 */
export function diasTrabajadosEnElAnio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined
): number {
  const anio = anioDe(salida);
  return anio === null ? 0 : diasTrabajadosEnAnio(entrada, salida, anio);
}

/** La doceava parte que corresponde: dias trabajados sobre el mes promedio. */
export const MES_PROMEDIO = 30.4;

/** Meses trabajados en el año de la salida, para la regalia. */
export function mesesEnElAnio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined
): number {
  return diasTrabajadosEnElAnio(entrada, salida) / MES_PROMEDIO;
}

/** Meses trabajados en un año concreto, tope 12: el doble sueldo de la lista. */
export function mesesEnAnio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined,
  anio: number
): number {
  return Math.min(12, diasTrabajadosEnAnio(entrada, salida, anio) / MES_PROMEDIO);
}

/**
 * ¿Esta persona entra en la lista del doble sueldo de este año?
 *
 * Entro antes de que acabara el año y no se fue antes de que empezara. La
 * pantalla lo decidia con `new Date(...).getFullYear()`, que en RD lee mal
 * cualquier fecha del 1 de enero.
 */
export function trabajoEnElAnio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined,
  anio: number
): boolean {
  const alta = anioDe(entrada);
  if (alta === null || alta > anio) return false;
  const baja = anioDe(salida);
  return baja === null || baja >= anio;
}

/**
 * Antiguedad total, en dias y en meses.
 *
 * Los meses salen de dividir por el año medio (365.25 dias, que reparte los
 * bisiestos) y no de contar meses de calendario: es lo que ya hacia
 * `calculateSettlement` y de ahi salen los tramos legales de preaviso y
 * cesantia, asi que cambiar la formula moveria cifras que nadie ha pedido
 * mover. Lo unico que cambia es de donde salen los DIAS.
 */
export const DIAS_POR_ANIO = 365.25;

export function diasDeServicio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined
): number {
  const alta = diaDe(entrada);
  const baja = diaDe(salida);
  if (!alta || !baja) return 0;
  return Math.max(0, diasEntreDias(alta, baja));
}

export function aniosDeServicio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined
): number {
  return diasDeServicio(entrada, salida) / DIAS_POR_ANIO;
}

export function mesesDeServicio(
  entrada: string | Date | null | undefined,
  salida: string | Date | null | undefined
): number {
  return aniosDeServicio(entrada, salida) * 12;
}
