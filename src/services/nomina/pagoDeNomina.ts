/**
 * Lote 295 (el "lote D" de `docs/diseno_asientos_nomina.md`): PAGAR una nomina
 * aprobada. La regla, pura: sin base de datos, para que la usen la ruta, la
 * pantalla y el banco.
 *
 * Que se paga y como (seccion 3, "Momento 2", del diseno):
 *
 *   Debe   Sueldos por pagar (`payroll_salaries_payable`, lote 292) ... Σ neto
 *   Haber  la cuenta contable del banco elegido, o la Caja General ...... Σ neto
 *
 * El NETO entero y de una vez: lo que el asiento de devengo (lote 293) dejo
 * en Sueldos por pagar. La TSS, el IR-3 y el Infotep NO se pagan aqui (D4 del
 * diseno): se pagan desde Bancos contra su cuenta por pagar, el mes siguiente.
 *
 * De donde sale el dinero es la misma regla que el pago a suplidor (lote 163,
 * `cxp/cuentaDelPago.ts`): la transferencia y el cheque salen de un banco
 * concreto, el efectivo de la caja. Y la referencia (numero de la
 * transferencia o del cheque) es obligatoria fuera del efectivo, como en el
 * cierre de caja (lote 172): sin ella el retiro no se encuentra en el estado
 * de cuenta al conciliar.
 */
import { METODOS_DE_PAGO, motivoParaNoRegistrarPago, saleDelBanco, type MetodoDePago } from '@/services/cxp/cuentaDelPago';
import { aCentavos, descripcionDelAsiento, type ImportesDelDetalle } from '@/services/nomina/asientoDeNomina';
import { nombreDelEstado } from '@/services/nomina/estadoDeNomina';

export { METODOS_DE_PAGO, saleDelBanco, type MetodoDePago };

/** La migracion que crea `pagos_de_nomina`. Se nombra en el 409 cuando falta. */
export const MIGRACION_DE_PAGOS = 'drizzle/0021_pagos_de_nomina.sql';

export const MOTIVO_SIN_TABLA_DE_PAGOS =
  `Todavía no se pueden pagar nóminas: falta aplicar la migración ${MIGRACION_DE_PAGOS} (la tabla de pagos de nómina). ` +
  'El resto de la nómina funciona igual; pida que se aplique y vuelva a intentarlo.';

export const NOMBRE_DEL_METODO: Record<MetodoDePago, string> = {
  transfer: 'Transferencia',
  check: 'Cheque',
  cash: 'Efectivo (caja)',
};

/** Lo que la pantalla manda al pagar. */
export interface PeticionDePago {
  metodo: string;
  bankAccountId?: string | null;
  /** 'aaaa-MM-dd': el dia en que sale el dinero, y la fecha del asiento. */
  fecha: string;
  /** Numero de la transferencia o del cheque. */
  referencia?: string | null;
}

/** El pago ya validado. */
export interface PagoValidado {
  metodo: MetodoDePago;
  bankAccountId: string | null;
  fecha: string;
  referencia: string | null;
}

const esMetodo = (m: string): m is MetodoDePago => (METODOS_DE_PAGO as readonly string[]).includes(m);

/** 'aaaa-MM-dd' que existe en el calendario; `null` si no. */
export function fechaValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Valida la peticion: metodo conocido, banco si y solo si el metodo sale del
 * banco (la regla del lote 163), fecha real y no futura, y referencia fuera
 * del efectivo. `hoy` es el dia de RD ('aaaa-MM-dd'): un pago no esta hecho
 * hasta que sale el dinero.
 */
export function validarPeticionDePago(p: PeticionDePago, hoy: string): { ok: true; pago: PagoValidado } | { ok: false; motivo: string } {
  const metodo = String(p?.metodo ?? '');
  if (!esMetodo(metodo)) {
    return { ok: false, motivo: 'Elija de dónde sale el pago: transferencia, cheque o efectivo de la caja.' };
  }
  const banco = p.bankAccountId ? String(p.bankAccountId) : null;
  const motivoBanco = motivoParaNoRegistrarPago(metodo, banco);
  if (motivoBanco) return { ok: false, motivo: motivoBanco };

  const fecha = fechaValida(p.fecha);
  if (!fecha) return { ok: false, motivo: 'La fecha del pago debe ser un día válido (aaaa-mm-dd).' };
  if (hoy && fecha > hoy) {
    return { ok: false, motivo: 'La fecha del pago no puede ser futura: la nómina no está pagada hasta que sale el dinero.' };
  }

  const referencia = typeof p.referencia === 'string' && p.referencia.trim() !== '' ? p.referencia.trim().slice(0, 100) : null;
  if (saleDelBanco(metodo) && !referencia) {
    return {
      ok: false,
      motivo: metodo === 'check'
        ? 'Escriba el número del cheque: sin él el retiro no se encuentra en el estado de cuenta al conciliar.'
        : 'Escriba la referencia de la transferencia: sin ella el retiro no se encuentra en el estado de cuenta al conciliar.',
    };
  }
  return { ok: true, pago: { metodo, bankAccountId: banco, fecha, referencia } };
}

/**
 * `null` si la nomina se puede pagar; si no, el motivo (409). Solo una
 * APROBADA y con su asiento de devengo: sin el, no hay "Sueldos por pagar"
 * que saldar, y pagarla dejaria esa cuenta deudora (una nomina aprobada antes
 * del lote 293 la asienta el contador, como la de julio de Latin Doors).
 */
export function motivoParaNoPagar(status: string, tieneDevengo: boolean): string | null {
  if (status === 'paid') return 'Esta nómina ya está pagada: no se paga dos veces.';
  if (status !== 'approved') {
    return `No se puede pagar una nómina ${nombreDelEstado(status)}: solo se pagan nóminas aprobadas.`;
  }
  if (!tieneDevengo) {
    return (
      'No se puede pagar esta nómina desde el sistema: se aprobó sin registrar su asiento de devengo (antes del lote 293), ' +
      'así que no hay "Sueldos por Pagar" que saldar. Su devengo y su pago los asienta el contador a mano.'
    );
  }
  return null;
}

/** El neto a pagar, en centavos: la suma de `net_salary` del detalle. `NaN` si alguno no es un numero. */
export function netoEnCentavos(detalles: readonly Pick<ImportesDelDetalle, 'netSalary'>[]): number {
  return detalles.reduce((s, d) => s + aCentavos(d.netSalary), 0);
}

/**
 * Lo que el devengo dejo en Sueldos por pagar tiene que ser el neto que se va
 * a pagar. `efecto` es debe - haber de esa cuenta en el asiento de la nomina
 * (negativo: acreedora). Si no cuadra (el enlace de Sueldos por pagar se
 * cambio despues de aprobar, o el asiento se toco a mano), pagar dejaria un
 * saldo colgando en una de las dos cuentas: se niega.
 */
export function motivoDevengoNoCuadra(efectoEnSueldosPorPagar: number, netoCentavos: number): string | null {
  if (Math.round(efectoEnSueldosPorPagar * 100) === -netoCentavos) return null;
  return (
    `El asiento de devengo de la nómina no deja ${(netoCentavos / 100).toFixed(2)} en la cuenta "Sueldos por Pagar" que está enlazada hoy ` +
    `(deja ${(-efectoEnSueldosPorPagar).toFixed(2)}). Puede que el enlace se haya cambiado después de aprobarla. ` +
    'No se paga: pagar dejaría un saldo colgando. Revíselo con el contador.'
  );
}

export interface LineaDelPago {
  accountId: string;
  debit: number;
  credit: number;
}

/**
 * Las dos lineas del asiento del pago: debe Sueldos por pagar, haber el banco
 * o la caja, por el neto. Se niega con un neto que no es positivo, o si las
 * dos cuentas son la misma (el asiento no moveria nada).
 */
export function lineasDelPago(
  netoCentavos: number,
  cuentaSueldosPorPagar: string,
  cuentaOrigen: string,
): { ok: true; lineas: LineaDelPago[]; total: number } | { ok: false; motivo: string } {
  if (!Number.isFinite(netoCentavos) || netoCentavos <= 0) {
    return { ok: false, motivo: 'La nómina no tiene neto a pagar: no hay nada que pagar.' };
  }
  if (!cuentaSueldosPorPagar || !cuentaOrigen) {
    return { ok: false, motivo: 'Falta la cuenta de Sueldos por Pagar o la del banco o la caja: no se puede registrar el pago.' };
  }
  if (cuentaSueldosPorPagar === cuentaOrigen) {
    return { ok: false, motivo: 'La cuenta de Sueldos por Pagar es la misma que la del banco o la caja: el asiento no movería nada.' };
  }
  const total = netoCentavos / 100;
  return {
    ok: true,
    total,
    lineas: [
      { accountId: cuentaSueldosPorPagar, debit: total, credit: 0 },
      { accountId: cuentaOrigen, debit: 0, credit: total },
    ],
  };
}

/** "Pago de nómina quincenal 01-15/10/2026 · Transferencia 12345". */
export function descripcionDelPago(periodStart: string, periodEnd: string, frequency: string, metodo: MetodoDePago, referencia: string | null): string {
  const base = descripcionDelAsiento(periodStart, periodEnd, frequency).replace(/^Nómina/, 'Pago de nómina');
  const como = metodo === 'cash' ? 'Efectivo' : `${NOMBRE_DEL_METODO[metodo]}${referencia ? ` ${referencia}` : ''}`;
  return `${base} · ${como}`;
}

/** La referencia del retiro en el libro de banco: la de la transferencia o el cheque. */
export function referenciaDelRetiro(metodo: MetodoDePago, referencia: string | null, pagoId: string): string {
  if (referencia) return metodo === 'check' ? `CHQ ${referencia}` : referencia;
  return `NOM-${pagoId.slice(0, 8)}`;
}

/** El motivo cuando el periodo del dia del pago no esta abierto. */
export function motivoPeriodoDelPago(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return (
    `No se puede pagar la nómina con fecha ${d}-${m}-${a}: en esa fecha no hay un período contable abierto (está cerrado o no se ha abierto). ` +
    'Elija la fecha real del pago, o abra el período en Contabilidad > Períodos.'
  );
}

/**
 * Lo que la pantalla puede ofrecer: el boton de pagar solo con una nomina
 * aprobada y con neto. Que tenga devengo lo decide el servidor (409).
 */
export function sePuedePagar(status: string, netoCentavos: number): boolean {
  return status === 'approved' && Number.isFinite(netoCentavos) && netoCentavos > 0;
}
