import { db, subscriptions } from '@/db';
import { eq, and, gte } from 'drizzle-orm';

/**
 * Verifica si una empresa tiene un plan (suscripción) activo y vigente.
 */
export async function hasActivePlan(companyId: string): Promise<boolean> {
  const activeSub = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, companyId),
        eq(subscriptions.status, 'active'),
        gte(subscriptions.currentPeriodEnd, new Date())
      )
    )
    .limit(1);

  return activeSub.length > 0;
}
