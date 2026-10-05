/**
 * QUE plan lleva la prueba gratis (lote 300, segunda parte).
 *
 * Decision del dueno (2026-10-05): en Administracion > Planes cada plan tiene una casilla "Plan de
 * prueba", y solo uno puede estar marcado (lo impide un indice unico parcial de la migracion 0022).
 * La prueba toma ESE plan, se llame como se llame: renombrar el plan ya no rompe las altas.
 *
 * La columna `plans.es_plan_de_prueba` NO esta en el esquema de Drizzle, a proposito: `plans` se lee
 * entera (`select()`) en varios sitios y, declarada antes de aplicar la 0022, los romperia (la leccion
 * de las 0013 y 0015). Aqui se mira si existe ANTES de nombrarla (el metodo de `hayPrecioUsd`, lote
 * 258, y del nivel de precio, 0019):
 *
 *  · SIN la columna: se busca por el nombre "Plan Básico", como antes de la 0022. El despliegue no
 *    depende de aplicarla.
 *  · CON la columna: manda la casilla. Si ninguno esta marcado, la alta se deshace con un mensaje
 *    que dice donde marcarlo (`NingunPlanDePrueba`): NO se cae al nombre, porque entonces desmarcar
 *    el plan no significaria nada.
 *
 * Solo se recuerda el "si existe": una columna no desaparece, pero una que falta puede aparecer en
 * cuanto alguien aplica la migracion, sin reiniciar el servidor.
 */
import { asc, sql } from 'drizzle-orm';
import { plans, type DbOTx } from '@/db';
import { NOMBRE_DEL_PLAN_DE_PRUEBA, nombreDePlanComparable } from './periodoDePrueba';

export const MIGRACION_PLAN_DE_PRUEBA = 'drizzle/0022_plan_de_prueba.sql';

/** Sin la 0022 y sin un plan con el nombre de siempre. */
export class PlanDePruebaNoExiste extends Error {
  constructor() {
    super(
      `No existe el plan "${NOMBRE_DEL_PLAN_DE_PRUEBA}", que da los limites de la prueba gratis de toda empresa nueva. ` +
      'Crealo (o devuelvele ese nombre) en Administracion > Planes; mientras falte, no se puede dar de alta una empresa.',
    );
    this.name = 'PlanDePruebaNoExiste';
  }
}

/** Con la 0022 y ningun plan marcado. */
export class NingunPlanDePrueba extends Error {
  constructor() {
    super('No hay plan de prueba: marque uno en Administración > Planes');
    this.name = 'NingunPlanDePrueba';
  }
}

/** Se pidio marcar un plan y la base no tiene la columna. */
export class FaltaMigracionPlanDePrueba extends Error {
  constructor() {
    super(`Para marcar el plan de prueba hay que aplicar la migracion ${MIGRACION_PLAN_DE_PRUEBA}.`);
    this.name = 'FaltaMigracionPlanDePrueba';
  }
}

let columnaVista = false;
export async function hayColumnaPlanDePrueba(tx: DbOTx): Promise<boolean> {
  if (columnaVista) return true;
  const filas = (await tx.execute(sql`SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'es_plan_de_prueba' LIMIT 1`)) as unknown as unknown[];
  columnaVista = filas.length > 0;
  return columnaVista;
}

type PlanDeLaPrueba = { id: string; name: string; porCasilla: boolean };

/** El plan de la prueba de ESTA base. Lanza si no hay ninguno (ver la cabecera). */
export async function planDePrueba(tx: DbOTx): Promise<PlanDeLaPrueba> {
  if (await hayColumnaPlanDePrueba(tx)) {
    const [marcado] = (await tx.execute(sql`SELECT id::text AS id, name FROM plans
      WHERE es_plan_de_prueba LIMIT 1`)) as unknown as Array<{ id: string; name: string }>;
    if (!marcado) throw new NingunPlanDePrueba();
    return { ...marcado, porCasilla: true };
  }
  const [porNombre] = await tx
    .select({ id: plans.id, name: plans.name })
    .from(plans)
    .where(sql`lower(btrim(${plans.name})) = ${nombreDePlanComparable(NOMBRE_DEL_PLAN_DE_PRUEBA)}`)
    // Si alguien duplico el nombre, siempre el mismo: el mas antiguo.
    .orderBy(asc(plans.createdAt), asc(plans.id))
    .limit(1);
  if (!porNombre) throw new PlanDePruebaNoExiste();
  return { ...porNombre, porCasilla: false };
}

/** Los ids marcados, o `null` si la base no tiene la columna (la pantalla no ofrece la casilla). */
export async function planesMarcados(tx: DbOTx): Promise<Set<string> | null> {
  if (!(await hayColumnaPlanDePrueba(tx))) return null;
  const filas = (await tx.execute(sql`SELECT id::text AS id FROM plans WHERE es_plan_de_prueba`)) as unknown as Array<{ id: string }>;
  return new Set(filas.map((f) => f.id));
}

/**
 * Marca (o desmarca) un plan como el de prueba. Al marcar, desmarca ANTES el que estaba, en la
 * transaccion que le pasen: el indice unico rechazaria dos marcados a la vez.
 * Sin la columna: marcar lanza `FaltaMigracionPlanDePrueba` (la ruta contesta 409); desmarcar no
 * hace nada, porque no hay nada marcado.
 */
export async function marcarPlanDePrueba(tx: DbOTx, planId: string, marcado: boolean): Promise<void> {
  if (!(await hayColumnaPlanDePrueba(tx))) {
    if (marcado) throw new FaltaMigracionPlanDePrueba();
    return;
  }
  if (!marcado) {
    await tx.execute(sql`UPDATE plans SET es_plan_de_prueba = false WHERE id = ${planId}::uuid`);
    return;
  }
  await tx.execute(sql`UPDATE plans SET es_plan_de_prueba = false WHERE es_plan_de_prueba AND id <> ${planId}::uuid`);
  await tx.execute(sql`UPDATE plans SET es_plan_de_prueba = true WHERE id = ${planId}::uuid`);
}

/**
 * Primera instalacion (`setup/confirm`): acaba de sembrar los planes y ninguno esta marcado. Marca
 * el del nombre de siempre, lo mismo que hace la 0022 al aplicarse. Sin la columna no hace falta.
 */
export async function marcarPlanDePruebaInicial(tx: DbOTx): Promise<void> {
  if (!(await hayColumnaPlanDePrueba(tx))) return;
  await tx.execute(sql`UPDATE plans SET es_plan_de_prueba = true
    WHERE id = (SELECT id FROM plans WHERE lower(btrim(name)) = ${nombreDePlanComparable(NOMBRE_DEL_PLAN_DE_PRUEBA)}
                ORDER BY created_at, id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM plans WHERE es_plan_de_prueba)`);
}
