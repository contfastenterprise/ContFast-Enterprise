/**
 * La prueba gratis de una empresa nueva: cuanto dura y con que plan (lote 300).
 *
 * DECISION DEL DUENO (2026-10-05)
 * -------------------------------
 * "Toda empresa nueva nace con una prueba gratis": una suscripcion en estado
 * `trialing`, de 30 dias desde la alta, con los limites del Plan Basico. Antes
 * ninguna alta creaba suscripcion (ni el registro, ni Administracion, ni el
 * asistente de la primera instalacion): medido en PRODUCCION ese dia, solo Latin
 * Doors tenia una, puesta a mano.
 *
 * Esto es lo PURO (sin `@/db`, para que se pueda ejecutar sin base): la regla de
 * las fechas y el nombre del plan. La escritura vive en `pruebaGratis.ts`.
 */
import { diaRD, DESFASE_RD_MS } from '@/utils/fechasLocales';

/** Decision del dueno, 2026-10-05: la prueba dura 30 dias. */
export const DIAS_DE_PRUEBA = 30;

/**
 * El nombre del plan de la prueba MIENTRAS la base no tenga la migracion 0022.
 * Desde la 0022 manda la casilla "Plan de prueba" de Administracion > Planes
 * (decision del dueno, 2026-10-05) y este nombre solo sirve para marcar el plan
 * la primera vez (la propia 0022 y `setup/confirm`). Ver `planDePrueba.ts`.
 *
 * Sin la 0022, el riesgo de buscar por nombre sigue ahi: renombrar el plan hace
 * que las altas fallen con un mensaje que nombra este texto. Escribir el `id` a
 * mano no era mejor: cambia de una base a otra.
 */
export const NOMBRE_DEL_PLAN_DE_PRUEBA = 'Plan Básico';

/** Lo que se compara en la base (`lower(btrim(name))`). */
export const nombreDePlanComparable = (nombre: string): string => nombre.trim().toLowerCase();

/**
 * El periodo de la prueba que empieza en `ahora`.
 *
 *  · INICIO: la medianoche del dia de REPUBLICA DOMINICANA en que se da de alta
 *    (`diaRD`), no la del servidor: Vercel corre en UTC, y una alta a las 21:00
 *    de RD ya es "manana" en UTC (la trampa del lote 174).
 *  · FIN: el ultimo instante del dia 30 -- inicio + 30 dias - 1 ms --. Es la
 *    misma convencion de cierre que ya tiene la unica suscripcion de PRODUCCION
 *    (Latin Doors termina el 2027-01-01T03:59:59.999Z, o sea el 31/12 a las
 *    23:59:59.999 de RD). Asi `diaRD(fin)` es el ultimo dia en que se puede usar,
 *    y "vigente si inicio <= ahora <= fin" no regala ni quita un dia.
 *
 * Las columnas son `timestamp` sin zona y la base guarda UTC (lote 174): se
 * devuelven instantes (`Date`), que drizzle escribe en UTC.
 */
export function periodoDePrueba(ahora: Date = new Date()): { inicio: Date; fin: Date; primerDia: string; ultimoDia: string } {
  const primerDia = diaRD(ahora);
  if (!primerDia) throw new Error('periodoDePrueba: fecha invalida');
  // Medianoche de RD = las 04:00 UTC de ese dia (RD no cambia la hora: UTC-4).
  const inicio = new Date(new Date(`${primerDia}T00:00:00.000Z`).getTime() + DESFASE_RD_MS);
  const fin = new Date(inicio.getTime() + DIAS_DE_PRUEBA * 24 * 60 * 60 * 1000 - 1);
  return { inicio, fin, primerDia, ultimoDia: diaRD(fin) };
}
