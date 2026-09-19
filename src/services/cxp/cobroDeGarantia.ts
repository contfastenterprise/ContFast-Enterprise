/**
 * Si el cobro de un cheque en garantia se puede asentar contra su factura.
 *
 * POR QUE EXISTE (lote 162)
 * -------------------------
 * Confirmar el cobro asienta el importe ENTERO del cheque: salida del banco,
 * debe a Cuentas por Pagar, movimiento en el estado de cuenta del suplidor.
 * Pero si la factura ya no debia ese importe -- se pago por otra via mientras
 * el cheque estaba pendiente --, solo se rebajaba lo que quedaba (`Math.min`) y
 * el resto se devolvia como "descuadre" DESPUES de haberlo asentado todo: el
 * mismo pago, dos veces en el mayor y en el banco.
 *
 * Paso de verdad el 2026-09-19 con el cheque 120 de EVERLAST DOORS: se registro
 * una transferencia estando el cheque pendiente. Pulsar "Registrar cobro"
 * habria sacado otros RD$78.381,82 de Scotiabank en los libros.
 *
 * Ahora el cobro se DETIENE antes de escribir nada, con el criterio de siempre
 * en este servicio: es preferible una operacion detenida que un asiento que
 * duplica un pago. Que hacer entonces (anular el otro pago, registrar un
 * anticipo) es una decision contable, no algo que el cobro pueda adivinar.
 *
 * En centavos enteros, como `garantiasDeFactura.ts`.
 */

const centavos = (v: string | number): number => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * `null` si el cheque se puede cobrar contra la factura; si no, el motivo, en
 * palabras para quien pulso el boton.
 */
export function motivoParaNoCobrar(importeCheque: string | number, saldoFactura: string | number): string | null {
  const importe = centavos(importeCheque);
  const saldo = centavos(saldoFactura);
  if (!Number.isFinite(importe) || !Number.isFinite(saldo) || importe <= 0) {
    return 'No se pudo leer el importe del cheque o el saldo de la factura.';
  }
  if (importe <= saldo) return null;
  return saldo <= 0
    ? `La factura ya está saldada: se pagó por otra vía mientras el cheque de RD$${fmt(importe)} estaba pendiente. ` +
      'Registrar su cobro asentaría ese pago por segunda vez contra el banco. Revise cuál de los dos pagos ocurrió de verdad.'
    : `La factura solo debe RD$${fmt(saldo)} y el cheque es de RD$${fmt(importe)}: recibió otros pagos mientras el cheque estaba pendiente. ` +
      'Registrar su cobro asentaría la diferencia como un pago de más. Revise los pagos de la factura antes de cobrarlo.';
}
