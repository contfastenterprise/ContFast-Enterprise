/**
 * Lo que los cheques en garantia pendientes ya cubren de una factura por pagar.
 *
 * POR QUE EXISTE (lote 161, pedido por el dueño el 2026-09-19)
 * -----------------------------------------------------------
 * Un cheque en garantia (post-fechado) queda en `pending_guarantee`: NO rebaja
 * el saldo de la factura hasta que se confirma su cobro. Asi que la factura
 * sigue mostrando su saldo entero, y el dialogo de pago lo proponia entero.
 * Pagarla en ese momento es pagarla DOS veces: una ahora y otra cuando el
 * banco cobre el cheque.
 *
 * Medido el 2026-09-19 (solo lectura), Latin Doors PRODUCCION: 3 facturas con
 * cheque pendiente, RD$395.352,21, las tres cubiertas enteras; y en una ya se
 * habia registrado un pago encima (su saldo es menor que el cheque).
 *
 * Esto no bloquea nada: el cobro puede no llegar (cheque devuelto, garantia
 * que se sustituye). Da los numeros para que el dialogo los enseñe y pida
 * confirmacion antes de pagar de mas.
 *
 * Todo en centavos enteros: el saldo y los importes llegan como texto decimal
 * de la base, y restarlos en coma flotante da 0,01 de diferencia donde no la hay.
 */

export interface ChequeEnGarantia {
  checkId?: string | null;
  checkNumber?: string | null;
  amount: string | number;
  /** Fecha de emision del cheque (la del pago registrado). */
  paymentDate?: string | null;
  /** Fecha pactada de cobro. */
  dueDate?: string | null;
  checkBankAccountId?: string | null;
}

export interface ResumenGarantias {
  cantidad: number;
  /** Suma de los cheques pendientes. */
  totalCheques: number;
  /** Lo que queda de la factura sin cubrir por cheques; nunca negativo. */
  saldoSinCubrir: number;
  /** Los cheques pendientes suman MAS que el saldo: ya se pago de mas. */
  cubiertoDeMas: boolean;
}

const centavos = (v: string | number): number => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function resumirGarantias(cheques: ChequeEnGarantia[], saldoFactura: string | number): ResumenGarantias {
  const total = cheques.reduce((s, c) => s + centavos(c.amount), 0);
  const saldo = centavos(saldoFactura);
  return {
    cantidad: cheques.length,
    totalCheques: total / 100,
    saldoSinCubrir: Math.max(0, saldo - total) / 100,
    cubiertoDeMas: total > saldo,
  };
}

/**
 * Si un pago nuevo, sumado a los cheques pendientes, pasa del saldo de la
 * factura. Sin cheques pendientes nunca es verdad: el tope del saldo ya lo
 * pone el propio dialogo (y el servidor).
 */
export function pagariaDeMas(resumen: ResumenGarantias, montoPago: string | number): boolean {
  if (resumen.cantidad === 0) return false;
  return centavos(montoPago) > centavos(resumen.saldoSinCubrir);
}
