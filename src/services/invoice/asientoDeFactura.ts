/**
 * El asiento de venta de un e-CF: con que cuentas y con que lineas.
 *
 * POR QUE VIVE AQUI (lote 140)
 * ----------------------------
 * Estaba escrito dentro de `InvoiceDbBooker.executeDbTransaction`, y solo lo
 * usaba la emision. El lote 140 anade la BAJA de un comprobante que la DGII
 * rechazo despues de contabilizado, y la baja necesita exactamente el asiento
 * contrario. Una segunda copia del reparto de cuentas es como se desincronizan
 * las cosas en este proyecto -- las tres lecturas del estado, las seis tablas de
 * tipos de comprobante --, asi que emision y baja salen de aqui.
 *
 * POR QUE LA BAJA NO ESPEJA EL ASIENTO ORIGINAL
 * ---------------------------------------------
 * Un espejo linea a linea repetiria las cuentas que uso el original, y los
 * asientos anteriores al lote 136 usaron cuentas de AGRUPACION (la nota
 * E340000000002 abono `1.1.02`). `createJournalEntry` las rechaza, y con razon.
 * Asi que la baja se construye como ya se construye la nota de credito -- "un
 * asiento nuevo con el efecto contrario, no una busqueda-y-reversion del
 * original" (ver el reverso de costo en `invoiceDbBooker`) --: los importes que
 * guardo la factura, las cuentas que resuelve HOY el mapeo.
 *
 * Las dos piezas van separadas a proposito: resolver cuentas necesita la base;
 * repartir importes no, y asi se puede probar ejecutandolo.
 */
import type { DbTransaction } from '@/db';
import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';

/** Una retencion sobre la venta, tal y como la guarda `invoice_retentions`. */
export interface RetencionDeVenta {
  retentionType: string;
  retentionAmount: number;
}

export interface CuentasDeVenta {
  cxc: string;
  caja: string;
  ventas: string;
  itbis: string;
  isrRetenido: string | null;
  itbisRetenido: string | null;
  otrasRetenciones: string | null;
}

export interface ImportesDeVenta {
  ecfType: string;
  paymentType: string;
  subtotal: number;
  totalDiscount: number;
  totalTaxes: number;
  totalNet: number;
  totalRetained: number;
  retenciones: RetencionDeVenta[];
}

export interface LineaDeAsiento {
  accountId: string;
  debit: number;
  credit: number;
}

/**
 * Las cuentas que usa el asiento. Solo resuelve las de retencion si hay alguna
 * de ese tipo: resolverlas de balde fallaria en una empresa que no las tiene.
 */
export async function resolverCuentasDeVenta(
  tx: DbTransaction,
  companyId: string,
  importes: Pick<ImportesDeVenta, 'totalRetained' | 'retenciones'>
): Promise<CuentasDeVenta> {
  // Auditoria P0-05 (2026-09-03): estas cuatro cuentas se resolvian con
  // `getOrCreateAccount`, que busca por codigo literal y CREA la cuenta si
  // no la encuentra. '1.1.02' y '1.1.01' ya existian en el catalogo real
  // como cuentas de AGRUPACION (Cuentas por Cobrar es la primera, no
  // Efectivo) -- postear ahi duplica el saldo entre padre e hijo. '2.1.03'
  // no existe en el catalogo real (el ITBIS por Pagar transaccional es
  // '2.1.02.01'); al no encontrarla, se creaba una cuenta nueva sin
  // `nature`, heredando 'debit' para lo que es un pasivo. `resolverCuentaPorMapeo`
  // nunca crea: resuelve por `accounting_mappings` o por el codigo correcto,
  // y valida que la cuenta sea transaccional, activa y de esta empresa.
  const accCxC = await resolverCuentaPorMapeo(tx, companyId, 'accounts_receivable', '1.1.02.01', 'Facturación - Cuentas por Cobrar');
  const accCaja = await resolverCuentaPorMapeo(tx, companyId, 'cash', '1.1.01.01', 'Facturación - Efectivo');
  const accVentas = await resolverCuentaPorMapeo(tx, companyId, 'sales_revenue', '4.1.01', 'Facturación - Ingresos por Ventas');
  const accItbis = await resolverCuentaPorMapeo(tx, companyId, 'itbis_sales', '2.1.02.01', 'Facturación - ITBIS por Pagar');

  // Las de retencion, igual que antes del lote 140: solo si la venta retiene
  // algo, y solo las del tipo que aparece.
  const retiene = importes.totalRetained > 0;
  const hay = (tipo: string) => retiene && importes.retenciones.some((r) => r.retentionType === tipo);
  const hayOtras = retiene && importes.retenciones.some((r) => r.retentionType !== 'ISR' && r.retentionType !== 'ITBIS');

  return {
    cxc: accCxC.id,
    caja: accCaja.id,
    ventas: accVentas.id,
    itbis: accItbis.id,
    isrRetenido: hay('ISR')
      ? (await resolverCuentaPorMapeo(tx, companyId, 'isr_retention_receivable', '1.1.04.02', 'Retención de ISR sobre venta')).id
      : null,
    itbisRetenido: hay('ITBIS')
      ? (await resolverCuentaPorMapeo(tx, companyId, 'itbis_retention_receivable', '1.1.04.03', 'Retención de ITBIS sobre venta')).id
      : null,
    otrasRetenciones: hayOtras
      ? (await resolverCuentaPorMapeo(tx, companyId, 'other_retention_receivable', '1.1.04.04', 'Otra retención sobre venta')).id
      : null,
  };
}

/**
 * Las lineas del asiento.
 *
 * `baja = false` es el asiento de siempre: una factura o nota de debito carga
 * el cobro y abona ventas e ITBIS; una nota de credito (e-34) hace lo
 * contrario. `baja = true` da el efecto CONTRARIO del que dio la emision.
 *
 * El orden de las lineas es el de antes del lote 140 -- en la nota de credito
 * el ITBIS va primero --, para que un asiento de emision salga identico.
 */
export function lineasDeVenta(
  cuentas: CuentasDeVenta,
  importes: ImportesDeVenta,
  baja = false
): LineaDeAsiento[] {
  const esNotaDeCredito = importes.ecfType === '34';
  // La nota de credito abona el cobro; su baja lo carga, como una factura.
  const abonaElCobro = esNotaDeCredito !== baja;

  const isCashOrBank = importes.paymentType === 'cash' || importes.paymentType === 'bank_transfer';
  const cuentaDeCobro = isCashOrBank ? cuentas.caja : cuentas.cxc;
  const ventaNeta = importes.subtotal - importes.totalDiscount;

  const lado = (accountId: string, importe: number, cargo: boolean): LineaDeAsiento =>
    cargo ? { accountId, debit: importe, credit: 0 } : { accountId, debit: 0, credit: importe };

  const cuentaDeRetencion = (tipo: string): string => {
    const id = tipo === 'ISR' ? cuentas.isrRetenido : tipo === 'ITBIS' ? cuentas.itbisRetenido : cuentas.otrasRetenciones;
    if (!id) throw new Error(`Falta la cuenta de la retención ${tipo}: no se resolvió antes de construir el asiento.`);
    return id;
  };

  const lineas: LineaDeAsiento[] = [];
  if (abonaElCobro) {
    // Forma de la nota de credito.
    lineas.push(lado(cuentas.ventas, ventaNeta, true));
    lineas.push(lado(cuentaDeCobro, importes.totalNet, false));
    if (importes.totalTaxes > 0) {
      lineas.unshift(lado(cuentas.itbis, importes.totalTaxes, true));
    }
    if (importes.totalRetained > 0) {
      for (const ret of importes.retenciones) {
        lineas.push(lado(cuentaDeRetencion(ret.retentionType), ret.retentionAmount, false));
      }
    }
  } else {
    // Forma de la factura.
    lineas.push(lado(cuentaDeCobro, importes.totalNet, true));
    lineas.push(lado(cuentas.ventas, ventaNeta, false));
    if (importes.totalTaxes > 0) {
      lineas.push(lado(cuentas.itbis, importes.totalTaxes, false));
    }
    if (importes.totalRetained > 0) {
      for (const ret of importes.retenciones) {
        lineas.push(lado(cuentaDeRetencion(ret.retentionType), ret.retentionAmount, true));
      }
    }
  }
  return lineas;
}
