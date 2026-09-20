/**
 * ¿De donde sale el dinero de una COMPRA? La regla, en un solo sitio.
 *
 * POR QUE EXISTE (lote 170)
 * -------------------------
 * Una compra "al contado" acreditaba la CAJA fuera cual fuera la forma de
 * pago: `isCredit ? cuentas por pagar : caja`. Y "al contado", para la DGII,
 * incluye el cheque, la transferencia (02) y la tarjeta (03). Medido el
 * 2026-09-19 en Latin Doors: 6 compras con tarjeta, RD$49.644,03, acreditaron
 * 1.1.01 -- que ademas es una cuenta de AGRUPACION -- como si hubieran salido
 * de la caja chica.
 *
 * Decidido por el dueño el 2026-09-19: el origen se ELIGE en cada compra,
 * porque la tarjeta puede ser de debito (sale de un banco) o de credito (la
 * paga el banco y la empresa se lo debe). Con cheque o transferencia siempre
 * es un banco.
 *
 *   01 efectivo  -> la caja (clave `cash`), como hasta ahora
 *   02 cheque/transferencia/deposito -> una cuenta BANCARIA
 *   03 tarjeta   -> una cuenta bancaria (debito) o una cuenta por pagar de
 *                   tarjeta de credito
 *   04 credito   -> cuentas por pagar al suplidor; no sale dinero todavia
 *
 * Sin base de datos: lo usan la ruta, el servicio y la pantalla.
 */

/**
 * Como se llama cada forma de pago, con los nombres del catalogo de la DGII
 * (campo "Forma de Pago" del 606).
 *
 * Esta aqui porque la pantalla de compras llamaba "Transferencia" al 03, que
 * es la TARJETA: quien pagaba por transferencia elegia 03, el 606 lo declaraba
 * como tarjeta, y el documento impreso -- que si usa el catalogo bueno -- decia
 * una cosa distinta de la pantalla donde se eligio. Elegir el origen del dinero
 * no tiene sentido si la forma de pago no significa lo que dice.
 */
export const FORMAS_DE_PAGO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque / Transferencia / Depósito',
  '03': 'Tarjeta de Crédito / Débito',
  '04': 'A Crédito (CxP)',
  '05': 'Permuta',
  '06': 'Nota de Crédito',
  '07': 'Mixto',
};

/** Las formas de pago que exigen decir de donde sale el dinero. */
export const necesitaOrigen = (metodo: string): boolean => metodo === '02' || metodo === '03';

/** Solo la tarjeta admite que el origen no sea un banco. */
export const admiteTarjetaDeCredito = (metodo: string): boolean => metodo === '03';

export interface OrigenDePago {
  /** La cuenta contable que ACREDITA el asiento. */
  paymentAccountId?: string | null;
  /** La cuenta bancaria de la que sale, si sale de un banco. */
  bankAccountId?: string | null;
}

/**
 * Por que no se puede registrar la compra tal como viene, o null si se puede.
 */
export function motivoParaNoRegistrarCompra(metodo: string, origen: OrigenDePago): string | null {
  const { paymentAccountId, bankAccountId } = origen;
  if (necesitaOrigen(metodo)) {
    if (!paymentAccountId && !bankAccountId) {
      return metodo === '02'
        ? 'Seleccione la cuenta bancaria de la que sale el pago: sin ella la compra acreditaría la caja, y no salió de la caja.'
        : 'Seleccione de dónde sale el pago con tarjeta: la cuenta bancaria (débito) o la cuenta por pagar de la tarjeta de crédito.';
    }
    if (!bankAccountId && !admiteTarjetaDeCredito(metodo)) {
      return 'Un pago con cheque o transferencia sale de una cuenta bancaria: seleccione cuál.';
    }
    return null;
  }
  if (bankAccountId || paymentAccountId) {
    return metodo === '01'
      ? 'Una compra en efectivo sale de la caja, no de un banco ni de una tarjeta. Quite el origen o cambie la forma de pago.'
      : 'Una compra a crédito no paga nada todavía: se salda con un pago al suplidor. Quite el origen o cambie la forma de pago.';
  }
  return null;
}

/**
 * La cuenta que acredita el asiento tiene que ser la del banco elegido, o -- en
 * la tarjeta de credito -- una cuenta por pagar transaccional y activa. `null`
 * si cuadra.
 */
export function motivoCuentaDelOrigen(
  metodo: string,
  origen: OrigenDePago,
  cuenta: { id: string; code: string; name: string; type: string; isTransactional: boolean; status: string; deletedAt: unknown } | undefined,
  banco: { chartAccountId: string | null; bankName: string; accountNumber: string } | undefined,
): string | null {
  if (!necesitaOrigen(metodo)) return null;

  if (origen.bankAccountId) {
    if (!banco) return 'La cuenta bancaria indicada no existe o no pertenece a la empresa.';
    if (!banco.chartAccountId) {
      return `La cuenta bancaria ${banco.bankName} ${banco.accountNumber} no tiene cuenta contable asignada, así que la compra no se puede contabilizar. Asígnesela en Bancos.`;
    }
    if (origen.paymentAccountId && origen.paymentAccountId !== banco.chartAccountId) {
      return `La cuenta del asiento no es la de ${banco.bankName} ${banco.accountNumber}: el libro de banco descontaría un banco y la contabilidad otro.`;
    }
    return null;
  }

  // Tarjeta de credito: una cuenta por pagar de la empresa.
  if (!cuenta || cuenta.deletedAt || cuenta.status !== 'active') {
    return 'La cuenta de la tarjeta no existe, no pertenece a la empresa o no está activa.';
  }
  if (!cuenta.isTransactional) {
    return `La cuenta ${cuenta.code} ${cuenta.name} es de agrupación y no admite movimientos. Elija una cuenta transaccional.`;
  }
  if (cuenta.type !== 'liability') {
    return `Una tarjeta de crédito se debe: elija una cuenta por pagar (pasivo), no ${cuenta.code} ${cuenta.name}.`;
  }
  return null;
}

/**
 * La pantalla elige el origen en UN solo desplegable (las cuentas bancarias y,
 * con tarjeta, las cuentas por pagar), asi que el valor tiene que decir de que
 * tipo es. Ida y vuelta aqui, juntas, porque una compra guardada hay que poder
 * volver a mostrarla en ese mismo campo al editarla.
 */
export const valorDeOrigen = (origen: OrigenDePago): string =>
  origen.bankAccountId
    ? `banco:${origen.bankAccountId}`
    : origen.paymentAccountId
      ? `cuenta:${origen.paymentAccountId}`
      : '';

export function partirOrigen(valor: string): OrigenDePago {
  if (valor.startsWith('banco:')) return { bankAccountId: valor.slice(6) || null, paymentAccountId: null };
  if (valor.startsWith('cuenta:')) return { paymentAccountId: valor.slice(7) || null, bankAccountId: null };
  return { bankAccountId: null, paymentAccountId: null };
}

export interface BancoDeCompra {
  bankAccountId: string;
  /** La cuenta del mayor de ese banco: contra ella se mide el cambio. */
  cuenta: string;
}

/**
 * Los bancos que hay que ajustar al editar (o borrar) una compra: el que tenia
 * y el que tiene ahora.
 *
 * Si no cambio, sale UNO SOLO y se mueve la diferencia (editar el importe
 * mueve lo que cambio; editar el concepto no mueve nada). Si cambio de banco,
 * salen los DOS: al de antes le vuelve el dinero y del nuevo sale, porque
 * medir solo el nuevo dejaria el retiro viejo colgando en el banco anterior.
 *
 * Una compra anterior al lote 170 no guarda ni banco ni cuenta: no tiene "el
 * de antes", y al editarla eligiendo banco solo sale el nuevo. Correcto: en su
 * libro nunca hubo nada que devolver.
 *
 * Vive aqui, con el resto de la regla, y no junto al movimiento de banco,
 * porque no toca la base: asi se puede probar sin levantar ninguna.
 */
export function bancosAAjustar(
  antes: { bankAccountId?: string | null; paymentAccountId?: string | null },
  despues: { bankAccountId?: string | null; cuentaQueAcredita?: string | null },
): BancoDeCompra[] {
  const lista: BancoDeCompra[] = [];
  const meter = (bankAccountId?: string | null, cuenta?: string | null) => {
    if (!bankAccountId || !cuenta) return;
    if (lista.some((b) => b.bankAccountId === bankAccountId && b.cuenta === cuenta)) return;
    lista.push({ bankAccountId, cuenta });
  };
  meter(antes.bankAccountId, antes.paymentAccountId);
  meter(despues.bankAccountId, despues.cuentaQueAcredita);
  return lista;
}

/** La cuenta que acredita el asiento, ya validada. */
export function cuentaQueAcredita(origen: OrigenDePago, banco: { chartAccountId: string | null } | undefined): string | null {
  if (origen.bankAccountId) return banco?.chartAccountId ?? null;
  return origen.paymentAccountId ?? null;
}
