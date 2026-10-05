/**
 * Lote 290: que se puede hacer con una nomina segun su estado. UNA regla, pura,
 * que comparten la ruta (`api/v1/hr/payroll`, a traves del repositorio) y la
 * pantalla (`dashboard/hr/payroll`, que solo ofrece lo que la ruta admitiria).
 *
 * Por que hacia falta (medido en `docs/diseno_asientos_nomina.md`, 2026-10-04):
 *  - `recalculatePayrollTx` no miraba el estado: una nomina APROBADA volvia a
 *    `calculated` con el detalle rehecho. La pantalla escondia el boton, pero la
 *    API lo admitia. Con el asiento al aprobar (lote C del diseno), eso dejaria
 *    en el libro unos importes que el detalle ya no tiene;
 *  - `approvePayroll` admitia `draft`: se aprobaba una nomina SIN detalle, es
 *    decir, sin importes.
 *
 * Estados (varchar en `payrolls.status`): draft -> calculated -> approved -> paid,
 * y `cancelled` (borrada). Hoy nada pone `paid` (no existe el paso de pagar:
 * lote D del diseno), pero la regla ya lo trata como posterior a `approved`.
 */

export const ESTADOS_DE_NOMINA = ['draft', 'calculated', 'approved', 'paid', 'cancelled'] as const;

/** Estados en los que el detalle todavia se puede rehacer (y la nomina borrar). */
const ABIERTOS: readonly string[] = ['draft', 'calculated'];

/** Error de una transicion no admitida: la ruta lo contesta con 409. */
export class NominaNoPermitidaError extends Error {
  readonly status = 409;
  readonly code = 'NOMINA_NO_PERMITIDA';
}

const NOMBRES: Record<string, string> = {
  draft: 'borrador',
  calculated: 'calculada',
  approved: 'aprobada',
  paid: 'pagada',
  cancelled: 'cancelada',
};

/** Como se le dice el estado a una persona. Un estado desconocido sale tal cual. */
export function nombreDelEstado(status: string): string {
  return NOMBRES[status] ?? status;
}

/** `null` si se puede recalcular; si no, el motivo para la pantalla. */
export function motivoParaNoRecalcular(status: string): string | null {
  if (ABIERTOS.includes(status)) return null;
  return `No se puede recalcular una nómina ${nombreDelEstado(status)}: sus importes ya quedaron fijados al aprobarla. Solo se recalculan borradores y nóminas calculadas.`;
}

/**
 * `null` si se puede aprobar; si no, el motivo. Hace falta estar `calculated`
 * y tener al menos una linea de detalle: un borrador no tiene importes, y una
 * nomina calculada sin empleados (ninguno activo con esa frecuencia) tampoco.
 */
export function motivoParaNoAprobar(status: string, lineasDeDetalle: number): string | null {
  if (status !== 'calculated') {
    if (status === 'draft') return 'No se puede aprobar un borrador: primero hay que calcular la nómina.';
    return `No se puede aprobar una nómina ${nombreDelEstado(status)}: solo se aprueban nóminas calculadas.`;
  }
  if (!(lineasDeDetalle > 0)) {
    return 'No se puede aprobar una nómina sin detalle: no tiene ningún empleado calculado. Recalcúlela o elimínela.';
  }
  return null;
}

/** `null` si se puede eliminar; si no, el motivo. Es la regla que ya tenia `deletePayroll`. */
export function motivoParaNoEliminar(status: string): string | null {
  if (ABIERTOS.includes(status)) return null;
  return 'No se pueden eliminar nóminas aprobadas o pagadas';
}

/** Lo que la pantalla puede ofrecer para una nomina. */
export function accionesDeNomina(status: string, lineasDeDetalle: number) {
  return {
    recalcular: motivoParaNoRecalcular(status) === null,
    aprobar: motivoParaNoAprobar(status, lineasDeDetalle) === null,
    eliminar: motivoParaNoEliminar(status) === null,
  };
}
