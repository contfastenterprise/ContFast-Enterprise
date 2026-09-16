/**
 * ¿A donde entra el dinero de un cobro? La regla, en un solo sitio.
 *
 * POR QUE ESTE FICHERO (lote 151)
 * -------------------------------
 * El recibo de cobro no guardaba contra que cuenta bancaria entro el dinero, y
 * el asiento debitaba la cuenta de caja fuera cual fuera el metodo. Medido el
 * 2026-09-16 en Latin Doors (PRODUCCION): 6 cobros por banco (RD$186.093,77,
 * del 15/07 al 11/09) debitaron 1.1.01 "Efectivo en Caja y Bancos", igual que
 * los 16 en efectivo; ninguno llego al libro de banco, y el saldo del banco no
 * se entero. Los depositos de clientes solo aparecian si alguien metia un
 * "Ajuste" a mano en Bancos.
 *
 * Decidido por el dueño el 2026-09-16: un cobro que no es en efectivo lleva su
 * cuenta bancaria; el asiento debita la cuenta contable de ESE banco y se crea
 * el deposito en el libro de banco (sube el saldo y queda pendiente de
 * conciliar), igual que ya hace el cobro de un cheque en garantia.
 *
 * Sin base de datos: lo usan la ruta, el repositorio y la pantalla.
 */

/** Los metodos que acepta la API. La pantalla hoy ofrece efectivo y banco. */
export const METODOS_DE_COBRO = ['cash', 'bank', 'check', 'card'] as const;
export type MetodoDeCobro = (typeof METODOS_DE_COBRO)[number];

/**
 * Todo lo que no es efectivo entra por un banco: la transferencia directamente,
 * el cheque al depositarlo, la tarjeta al liquidar el procesador.
 */
export const entraPorBanco = (metodo: string): boolean => metodo !== 'cash';

/**
 * Por que no se puede registrar el cobro tal como viene, o null si se puede.
 *
 * Un cobro por banco sin cuenta es justo el defecto que se cierra. Un cobro en
 * efectivo CON cuenta bancaria es contradictorio: iria a la caja y al banco a
 * la vez; se niega en vez de ignorar la cuenta, para que nadie crea que el
 * dinero quedo en el banco.
 */
export function motivoParaNoRegistrarCobro(metodo: string, bankAccountId: string | null | undefined): string | null {
  if (entraPorBanco(metodo) && !bankAccountId) {
    return 'Seleccione la cuenta bancaria donde entró el cobro: sin ella el asiento no sabe qué banco debitar y el depósito no llega al libro de banco.';
  }
  if (!entraPorBanco(metodo) && bankAccountId) {
    return 'Un cobro en efectivo entra a la caja, no a una cuenta bancaria. Quite la cuenta bancaria o cambie el método de pago.';
  }
  return null;
}
