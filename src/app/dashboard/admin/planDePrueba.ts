/**
 * Lote 300: la casilla "Plan de prueba" de Administracion > Planes, lo que no es pintar.
 *
 * La columna llega con la migracion 0022 y la ruta dice si la base la tiene
 * (`planDePrueba.disponible`). Sin ella, la casilla sale deshabilitada y lo que se manda al
 * guardar NO lleva el campo: mandarlo marcado daria un 409 que nadie pidio.
 */
export interface EstadoPlanDePrueba {
  disponible: boolean;
  migracion: string;
}

export const SIN_DATOS_PLAN_DE_PRUEBA: EstadoPlanDePrueba = { disponible: false, migracion: 'drizzle/0022_plan_de_prueba.sql' };

/** Lo que se manda al crear o editar un plan. */
export function cuerpoDelPlan<T extends { esPlanDePrueba: boolean }>(formulario: T, estado: EstadoPlanDePrueba): Omit<T, 'esPlanDePrueba'> & { esPlanDePrueba?: boolean } {
  if (estado.disponible) return formulario;
  const { esPlanDePrueba: _quitado, ...resto } = formulario;
  void _quitado;
  return resto;
}

/** Lee el estado que manda `GET /api/v1/admin/plans`; cualquier otra forma, "no disponible". */
export function estadoPlanDePrueba(respuesta: unknown): EstadoPlanDePrueba {
  const p = (respuesta as { planDePrueba?: { disponible?: unknown; migracion?: unknown } } | null)?.planDePrueba;
  if (!p || typeof p.disponible !== 'boolean') return SIN_DATOS_PLAN_DE_PRUEBA;
  return { disponible: p.disponible, migracion: typeof p.migracion === 'string' ? p.migracion : SIN_DATOS_PLAN_DE_PRUEBA.migracion };
}
