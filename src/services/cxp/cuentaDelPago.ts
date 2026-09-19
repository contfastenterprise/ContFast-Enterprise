/**
 * ¿De donde sale el dinero de un pago a suplidor? La regla, en un solo sitio.
 *
 * POR QUE ESTE FICHERO (lote 163)
 * -------------------------------
 * Un pago a suplidor por transferencia o por cheque normal se asentaba (debe
 * Cuentas por Pagar, haber la cuenta que eligiera la pantalla), pero NO movia
 * el saldo del banco ni dejaba movimiento en su libro: la transferencia ni
 * siquiera mandaba la cuenta bancaria. El cobro de un cheque en garantia si
 * lo hacia, asi que el mismo pago aparecia o no en el banco segun el camino.
 * Medido el 2026-09-19 en Latin Doors (PRODUCCION): 1 transferencia de
 * RD$6.923,52 del 06/08 sin movimiento de banco.
 *
 * El mismo criterio que el lote 151 decidio para los cobros a clientes
 * (`services/cartera/cuentaDelCobro.ts`): lo que no es efectivo sale de un
 * banco concreto; el asiento acredita la cuenta contable de ESE banco y se crea
 * el retiro en su libro (baja el saldo y queda pendiente de conciliar).
 *
 * Sin base de datos: lo usan el servicio y la pantalla.
 */

export const METODOS_DE_PAGO = ['cash', 'transfer', 'check'] as const;
export type MetodoDePago = (typeof METODOS_DE_PAGO)[number];

/** La transferencia y el cheque salen de un banco; el efectivo, de la caja. */
export const saleDelBanco = (metodo: string): boolean => metodo !== 'cash';

/**
 * Por que no se puede registrar el pago tal como viene, o null si se puede.
 *
 * Un pago por banco sin cuenta es el defecto que se cierra. Un pago en
 * efectivo CON cuenta bancaria es contradictorio: se niega en vez de ignorar
 * la cuenta, para que nadie crea que el dinero salio del banco.
 */
export function motivoParaNoRegistrarPago(metodo: string, bankAccountId: string | null | undefined): string | null {
  if (saleDelBanco(metodo) && !bankAccountId) {
    return 'Seleccione la cuenta bancaria de la que sale el pago: sin ella el retiro no llega al libro de banco y su saldo no se entera.';
  }
  if (!saleDelBanco(metodo) && bankAccountId) {
    return 'Un pago en efectivo sale de la caja, no de una cuenta bancaria. Quite la cuenta bancaria o cambie el método de pago.';
  }
  return null;
}

/**
 * La cuenta de credito del asiento tiene que ser la del banco elegido: si no,
 * el libro de banco descontaria un banco y el mayor otro. `null` si cuadra.
 */
export function motivoCuentaDelBanco(
  creditAccountId: string,
  banco: { chartAccountId: string | null; bankName: string; accountNumber: string }
): string | null {
  if (!banco.chartAccountId) {
    return `La cuenta bancaria ${banco.bankName} ${banco.accountNumber} no tiene cuenta contable asignada, así que el pago no se puede contabilizar. Asígnesela en Bancos antes de pagar.`;
  }
  if (banco.chartAccountId !== creditAccountId) {
    return `La cuenta de crédito del asiento no es la de ${banco.bankName} ${banco.accountNumber}: el libro de banco descontaría un banco y la contabilidad otro. Use la cuenta contable de ese banco.`;
  }
  return null;
}
