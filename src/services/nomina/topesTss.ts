/**
 * Lote 290 (segunda parte): el salario minimo con el que se calculan los TOPES
 * de la TSS (AFP 20 salarios minimos, SFS 10, SRL 4).
 *
 * Antes era una constante del calculo, `SALARIO_MINIMO_TSS = 16262.50`, fijada
 * en el codigo. DECISION DEL CONTADOR (via el dueño, 2026-10-04): el salario
 * minimo de los topes es **RD$10.000,00**, y es dato de la empresa, no del
 * codigo ("nada estatico", lote 171). Vive en `payroll_configs.salario_minimo_tss`
 * (migracion 0020), se siembra con 10.000 al dar de alta la empresa y se cambia
 * en Configuracion de RRHH.
 *
 * Este 10.000 es SOLO el valor por defecto: el de la siembra, y el que usa el
 * calculo mientras falte la columna (migracion sin aplicar) o el valor de la
 * empresa. Pura: la comparten el calculo, la siembra, la ruta y la pantalla.
 */

/** Decision del contador, 2026-10-04: salario minimo de los topes de la TSS. */
export const SALARIO_MINIMO_TSS_POR_DEFECTO = 10000;

/** Tope razonable para rechazar un valor a medio escribir o un error de dedo. */
const MAXIMO = 10_000_000;

/** El valor si es un salario minimo valido (positivo, finito, a centavos); si no, `null`. */
export function salarioMinimoValido(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > MAXIMO) return null;
  return Math.round(n * 100) / 100;
}

/** El salario minimo que usa el calculo: el de la empresa si es valido; si no, el de por defecto. */
export function salarioMinimoEfectivo(guardado: unknown): number {
  return salarioMinimoValido(guardado) ?? SALARIO_MINIMO_TSS_POR_DEFECTO;
}

/** El mensaje cuando se quiere guardar el salario minimo y la base no tiene la columna. */
export const MOTIVO_SIN_COLUMNA_SALARIO_MINIMO =
  'Falta aplicar la migración drizzle/0020_salario_minimo_tss.sql: el salario mínimo de los topes de la TSS no se puede guardar todavía (mientras tanto se calcula con RD$10.000,00).';
