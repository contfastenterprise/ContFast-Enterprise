/**
 * Crear la prueba gratis de una empresa (lote 300). UNA sola funcion, y la usan
 * todas las altas: `crearEmpresaConSuSiembra` (registro publico y Administracion),
 * `setup/confirm` (la primera instalacion) y el guion que se la da a las empresas
 * que ya existian sin suscripcion.
 *
 * La regla de las fechas esta en `periodoDePrueba.ts`; QUE plan se usa, en
 * `planDePrueba.ts` (la casilla "Plan de prueba" de Administracion > Planes, o el
 * nombre "Plan Básico" si la base aun no tiene la migracion 0022).
 *
 * TRES DECISIONES
 * ---------------
 *  1. Va DENTRO de la transaccion que le pasen. Si la alta falla despues, la
 *     prueba cae con la empresa; si la prueba falla, cae la empresa. No queda una
 *     empresa sin prueba ni una prueba sin empresa.
 *
 *  2. Si no hay plan de prueba (ninguno marcado, o sin la 0022 ninguno con el
 *     nombre de siempre), LANZA y la alta entera se deshace. La otra opcion --
 *     seguir sin prueba -- deja una empresa sin suscripcion, que es exactamente el
 *     estado que este lote viene a cerrar, y nadie se enteraria: la alta
 *     "funciona". Fallar se ve el primer dia, y el mensaje dice donde arreglarlo.
 *     No se crea el plan aqui: su precio y sus limites son una decision comercial.
 *
 *  3. Si la empresa YA tiene una suscripcion -- de cualquier estado, tambien una
 *     cancelada --, no crea otra. Una prueba es para quien nunca tuvo plan: una
 *     empresa que cancelo no estrena otra prueba por pasar por aqui. Antes de
 *     mirar se BLOQUEA la fila de la empresa (`FOR UPDATE`), asi dos llamadas a
 *     la vez (dos guiones, un guion y una alta) no crean dos.
 */
import { eq } from 'drizzle-orm';
import { companies, subscriptions, type DbOTx } from '@/db';
import { periodoDePrueba } from './periodoDePrueba';
import { planDePrueba } from './planDePrueba';

//  Quien ya los importaba de aqui (el guion de datos) sigue funcionando.
export { planDePrueba, PlanDePruebaNoExiste, NingunPlanDePrueba } from './planDePrueba';

export type ResultadoDePrueba =
  | { creada: true; suscripcionId: string; planId: string; inicio: Date; fin: Date }
  | { creada: false; motivo: 'ya_tiene_suscripcion'; suscripcionId: string };

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

  // Lanza si no hay plan de prueba (ver `planDePrueba.ts`).
  const plan = await planDePrueba(tx);

  const { inicio, fin } = periodoDePrueba(ahora);
  const [nueva] = await tx
    .insert(subscriptions)
    .values({ companyId, planId: plan.id, status: 'trialing', currentPeriodStart: inicio, currentPeriodEnd: fin })
    .returning({ id: subscriptions.id });
  return { creada: true, suscripcionId: nueva.id, planId: plan.id, inicio, fin };
}
