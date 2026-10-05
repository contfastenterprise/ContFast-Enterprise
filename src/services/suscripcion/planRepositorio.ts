/**
 * Lo que la regla del plan (`planVigente.ts`) necesita leer de la base. Lote 299.
 *
 * Aqui no se decide nada: se leen las suscripciones y se cuenta, y la decision
 * es de la regla pura. Todas las consultas van acotadas por empresa.
 *
 * LOS INDICES (medidos en PRODUCCION el 2026-10-05)
 *   · `subscriptions_company_idx` (company_id): una empresa tiene una o dos filas.
 *   · `invoices_comp_status_created_modo_idx` (company_id, status, created_at,
 *     modo): la cuenta del mes filtra por esas cuatro columnas y por eso compara
 *     `created_at` contra INSTANTES (ver `mesDeRD`) y no convierte la columna.
 *   · `users_company_idx`, `warehouses_company_idx`.
 *
 * LAS ALTAS SIMULTANEAS
 * Contar y luego insertar, sin bloqueo, deja pasar a dos altas a la vez con el
 * cupo lleno menos uno: las dos cuentan N-1 y las dos insertan. Las guardas de
 * usuarios y almacenes toman `pg_advisory_xact_lock` por empresa DENTRO de la
 * transaccion que inserta: la segunda espera a que la primera confirme y cuenta
 * ya con ella. Un candado de transaccion se suelta solo al terminar.
 */
import { and, eq, gte, inArray, lt, count, sql } from 'drizzle-orm';
import { db, subscriptions, plans, invoices, users, warehouses, type DbOTx } from '@/db';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import {
  situacionDelPlan,
  decidirEmision,
  decidirAltaDeUsuario,
  decidirAltaDeAlmacen,
  cuentaParaElLimite,
  mesDeRD,
  avisosDelPlan,
  usoDelMes,
  PlanNoPermiteError,
  ESTADOS_QUE_SALIERON,
  type SituacionDelPlan,
  type BloqueoDelPlan,
} from '@/services/suscripcion/planVigente';
import type { AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

/** La situacion del plan de una empresa, hoy. */
export async function leerSituacionDelPlan(
  companyId: string,
  ahora: Date = new Date(),
  ex: DbOTx = db,
): Promise<SituacionDelPlan> {
  const filas = await ex
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planName: plans.name,
      maxEcfLimit: plans.maxEcfLimit,
      maxUsers: plans.maxUsers,
      maxWarehouses: plans.maxWarehouses,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.companyId, companyId));
  return situacionDelPlan(filas, ahora);
}

/**
 * Los e-CF que cuentan para el limite este mes de RD: de PRODUCCION y que
 * salieron a la DGII. Por filas de `invoices`: un reenvio no añade ninguna.
 */
export async function contarEcfDelMes(companyId: string, ahora: Date = new Date(), ex: DbOTx = db): Promise<number> {
  const { desde, hasta } = mesDeRD(ahora);
  const [fila] = await ex
    .select({ n: count() })
    .from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      eq(invoices.modo, 'PRODUCCION'),
      inArray(invoices.status, [...ESTADOS_QUE_SALIERON]),
      gte(invoices.createdAt, desde),
      lt(invoices.createdAt, hasta),
    ));
  return Number(fila?.n ?? 0);
}

/** Usuarios activos de la empresa (los que ocupan cupo). */
export async function contarUsuariosActivos(companyId: string, ex: DbOTx = db): Promise<number> {
  const [fila] = await ex
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, 'active')));
  return Number(fila?.n ?? 0);
}

/**
 * Almacenes de la empresa, TODOS: como antes del lote. Un almacen desactivado
 * se puede volver a activar sin pasar por el alta, asi que contar solo los
 * activos dejaria esa puerta abierta.
 */
export async function contarAlmacenes(companyId: string, ex: DbOTx = db): Promise<number> {
  const [fila] = await ex
    .select({ n: count() })
    .from(warehouses)
    .where(eq(warehouses.companyId, companyId));
  return Number(fila?.n ?? 0);
}

/** Serializa, por empresa, las altas que cuentan contra un limite del plan. */
export async function bloquearLimitesDeLaEmpresa(tx: DbOTx, companyId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'limites-del-plan|' + companyId}))`);
}

/**
 * Si se puede emitir, enviar o reenviar un e-CF. `null` si si.
 *
 * `factura`: la que se envia o reenvia, si ya existe. Si ya cuenta para el
 * limite (PRODUCCION y salio a la DGII: un rechazado que se corrige), el envio
 * no añade uno -- ver `decidirEmision`.
 */
export async function bloqueoDeEmision(
  companyId: string,
  modo: ModoOperativo,
  factura?: { modo: string; status: string } | null,
  ahora: Date = new Date(),
): Promise<BloqueoDelPlan | null> {
  const sit = await leerSituacionDelPlan(companyId, ahora);
  if (!sit.vigente || modo !== 'PRODUCCION') return decidirEmision(sit, { modo, usadosEnElMes: 0, ahora });
  const usados = await contarEcfDelMes(companyId, ahora);
  return decidirEmision(sit, { modo, usadosEnElMes: usados, yaCuenta: factura ? cuentaParaElLimite(factura) : false, ahora });
}

/** Para lo que solo exige un plan vigente: nomina y asientos manuales. */
export async function bloqueoSinPlanVigente(companyId: string, ahora: Date = new Date()): Promise<BloqueoDelPlan | null> {
  return (await leerSituacionDelPlan(companyId, ahora)).bloqueo;
}

/** Dentro de la transaccion del alta: candado, cuenta y decide. Lanza si no se puede. */
export async function exigirAltaDeUsuario(tx: DbOTx, companyId: string, ahora: Date = new Date()): Promise<void> {
  await bloquearLimitesDeLaEmpresa(tx, companyId);
  const sit = await leerSituacionDelPlan(companyId, ahora, tx);
  const b = decidirAltaDeUsuario(sit, sit.vigente ? await contarUsuariosActivos(companyId, tx) : 0);
  if (b) throw new PlanNoPermiteError(b);
}

/** Igual que `exigirAltaDeUsuario`, para almacenes. */
export async function exigirAltaDeAlmacen(tx: DbOTx, companyId: string, ahora: Date = new Date()): Promise<void> {
  await bloquearLimitesDeLaEmpresa(tx, companyId);
  const sit = await leerSituacionDelPlan(companyId, ahora, tx);
  const b = decidirAltaDeAlmacen(sit, sit.vigente ? await contarAlmacenes(companyId, tx) : 0);
  if (b) throw new PlanNoPermiteError(b);
}

/** Los avisos del plan para el panel. */
export async function avisosDelPlanDeLaEmpresa(companyId: string, modo: ModoOperativo, ahora: Date = new Date()): Promise<AvisoDelPanel[]> {
  const sit = await leerSituacionDelPlan(companyId, ahora);
  const usados = sit.vigente && modo === 'PRODUCCION' ? await contarEcfDelMes(companyId, ahora) : 0;
  return avisosDelPlan(sit, { modo, usadosEnElMes: usados, ahora });
}

/** Lo que enseña Configuracion > Plan & Suscripcion: la MISMA cuenta que las guardas. */
export async function usoDelPlan(companyId: string, ahora: Date = new Date()) {
  const [sit, ecf, usuarios, almacenes] = await Promise.all([
    leerSituacionDelPlan(companyId, ahora),
    contarEcfDelMes(companyId, ahora),
    contarUsuariosActivos(companyId),
    contarAlmacenes(companyId),
  ]);
  return { situacion: sit, ecf: usoDelMes(sit, ecf), mes: mesDeRD(ahora).mes, usuarios, almacenes };
}
