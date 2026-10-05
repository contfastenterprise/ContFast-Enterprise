/**
 * Crear la prueba gratis de una empresa (lote 300). UNA sola funcion, y la usan
 * todas las altas: `crearEmpresaConSuSiembra` (registro publico y Administracion),
 * `setup/confirm` (la primera instalacion) y el guion que se la da a las empresas
 * que ya existian sin suscripcion.
 *
 * La regla de las fechas y el nombre del plan estan en `periodoDePrueba.ts`.
 *
 * TRES DECISIONES
 * ---------------
 *  1. Va DENTRO de la transaccion que le pasen. Si la alta falla despues, la
 *     prueba cae con la empresa; si la prueba falla, cae la empresa. No queda una
 *     empresa sin prueba ni una prueba sin empresa.
 *
 *  2. Si el Plan Basico NO existe, LANZA (`PlanDePruebaNoExiste`) y la alta
 *     entera se deshace. La otra opcion -- seguir sin prueba -- deja una empresa
 *     sin suscripcion, que es exactamente el estado que este lote viene a cerrar,
 *     y nadie se enteraria: la alta "funciona". Fallar se ve el primer dia y se
 *     arregla creando (o devolviendole el nombre a) el plan. En produccion existe
 *     desde el 28/06; `setup/confirm` lo siembra antes de crear la empresa.
 *     No se crea el plan aqui: su precio y sus limites son una decision
 *     comercial, no de codigo.
 *
 *  3. Si la empresa YA tiene una suscripcion -- de cualquier estado, tambien una
 *     cancelada --, no crea otra. Una prueba es para quien nunca tuvo plan: una
 *     empresa que cancelo no estrena otra prueba por pasar por aqui. Antes de
 *     mirar se BLOQUEA la fila de la empresa (`FOR UPDATE`), asi dos llamadas a
 *     la vez (dos guiones, un guion y una alta) no crean dos.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { companies, plans, subscriptions, type DbOTx } from '@/db';
import { NOMBRE_DEL_PLAN_DE_PRUEBA, nombreDePlanComparable, periodoDePrueba } from './periodoDePrueba';

export class PlanDePruebaNoExiste extends Error {
  constructor() {
    super(
      `No existe el plan "${NOMBRE_DEL_PLAN_DE_PRUEBA}", que da los limites de la prueba gratis de toda empresa nueva. ` +
      'Crealo (o devuelvele ese nombre) en Administracion > Planes; mientras falte, no se puede dar de alta una empresa.',
    );
    this.name = 'PlanDePruebaNoExiste';
  }
}

export type ResultadoDePrueba =
  | { creada: true; suscripcionId: string; planId: string; inicio: Date; fin: Date }
  | { creada: false; motivo: 'ya_tiene_suscripcion'; suscripcionId: string };

/** El Plan Basico de ESTA base, por nombre (ver el riesgo en `periodoDePrueba.ts`). */
export async function planDePrueba(tx: DbOTx): Promise<{ id: string; name: string } | null> {
  const [plan] = await tx
    .select({ id: plans.id, name: plans.name })
    .from(plans)
    .where(sql`lower(btrim(${plans.name})) = ${nombreDePlanComparable(NOMBRE_DEL_PLAN_DE_PRUEBA)}`)
    // Si alguien duplico el nombre, siempre el mismo: el mas antiguo.
    .orderBy(asc(plans.createdAt), asc(plans.id))
    .limit(1);
  return plan ?? null;
}

export async function crearPruebaGratis(tx: DbOTx, companyId: string, ahora: Date = new Date()): Promise<ResultadoDePrueba> {
  // Bloquear la empresa antes de mirar: serializa a quien quiera darle prueba a la vez.
  const [empresa] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for('update');
  if (!empresa) throw new Error(`crearPruebaGratis: no existe la empresa ${companyId}`);

  const [yaTiene] = await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.companyId, companyId))
    .limit(1);
  if (yaTiene) return { creada: false, motivo: 'ya_tiene_suscripcion', suscripcionId: yaTiene.id };

  const plan = await planDePrueba(tx);
  if (!plan) throw new PlanDePruebaNoExiste();

  const { inicio, fin } = periodoDePrueba(ahora);
  const [nueva] = await tx
    .insert(subscriptions)
    .values({ companyId, planId: plan.id, status: 'trialing', currentPeriodStart: inicio, currentPeriodEnd: fin })
    .returning({ id: subscriptions.id });
  return { creada: true, suscripcionId: nueva.id, planId: plan.id, inicio, fin };
}
