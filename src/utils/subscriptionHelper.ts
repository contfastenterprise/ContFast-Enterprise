import { bloqueoSinPlanVigente } from '@/services/suscripcion/planRepositorio';

/**
 * Si una empresa tiene un plan vigente.
 *
 * LOTE 299: delega en la regla unica (`services/suscripcion/planVigente.ts`). Antes
 * miraba solo `status = 'active'` y el instante de fin, asi que una prueba gratis
 * (`trialing`) bloqueaba la nomina y los asientos. Ya no lo usa ninguna ruta (dan el
 * motivo con `bloqueoSinPlanVigente`); se queda para quien lo importe por fuera.
 */
export async function hasActivePlan(companyId: string): Promise<boolean> {
  return (await bloqueoSinPlanVigente(companyId)) === null;
}
