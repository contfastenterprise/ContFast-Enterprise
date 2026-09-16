/**
 * El fichero TXT del Formato 606 (compras de bienes y servicios), segun la
 * Norma General 07-2018 de la DGII, Anexo A.
 *
 * POR QUE EXISTE (lote 144)
 * -------------------------
 * `generate606Txt` no se parecia al Anexo A en nada:
 *
 *   - Cabecera `606|<uuid interno>|AAAA-MM`: sin RNC, sin cantidad de registros
 *     y con el guion dentro del periodo. La norma: `606|RNC|AAAAMM|cantidad`.
 *   - El detalle NI SIQUIERA iba separado por "|": era un bloque de ancho fijo
 *     con siete datos pegados -- NCF relleno a 19, fecha, forma de pago y cuatro
 *     importes --, sin el RNC del proveedor, sin tipo de bienes y servicios, sin
 *     fecha de pago, sin la division bienes/servicios. La norma pide 23 campos.
 *   - Importes sin punto decimal (cien veces mas), como el 607 antes del lote 142.
 *   - Entraban las compras borradas (`getExpenses` no miraba `deleted_at`;
 *     medido el 2026-09-16: cero hoy).
 *
 * El texto de la norma esta en `scratch/_to_delete/referencia_dgii/`.
 *
 * DECISIONES, CADA UNA CON SU DUEÑO
 * ---------------------------------
 *   - Sin NCF no va al TXT (decidido por el dueño el 2026-09-16). Una linea del
 *     606 sin NCF no es valida. Medido: 13 gastos menores de julio, sin NCF ni
 *     proveedor. La pantalla los enseña aparte.
 *   - Servicios contra bienes (recomendacion aplicada, cambia aqui): 94 de 105
 *     compras no tienen lineas. Con lineas, las que llevan producto son bienes y
 *     el resto servicios; sin lineas, el tipo 09 (compras que forman parte del
 *     costo de venta) es bienes y cualquier otro, servicios.
 *   - Fecha de pago (recomendacion aplicada, cambia aqui): la columna
 *     `payment_date` esta vacia en las 105. Si consta, esa; si no y la compra no
 *     es a credito (forma 04), la del comprobante; a credito, vacia.
 *
 * LO QUE NO SE PUEDE LLENAR, Y SE DEJA EN BLANCO SIN INVENTARLO
 *   - 14 ITBIS llevado al costo: el sistema no lo registra. Por eso el 15, ITBIS
 *     por adelantar ("ITBIS facturado menos llevado al costo"), es el facturado.
 *   - 17 Tipo de retencion en ISR: el sistema no lo registra. Afecta a UNA
 *     compra medida (E310000012260, julio), cuya retencion el informe del cuadre
 *     ya pone en duda.
 *   - 16 y 19, percibidos: "no habilitado" segun la propia norma.
 */
import { importe607 as importeDgii } from './formato607';

export interface LineaDeCompra606 {
  productId: string | null;
  subtotal: string | number;
}

export interface Compra606 {
  ncf: string | null;
  ncfModified: string | null;
  supplierRnc: string | null;
  expenseType: string;
  issueDate: string;          // AAAA-MM-DD
  paymentDate: string | null; // AAAA-MM-DD
  paymentMethod: string;      // 01 a 07, codigos del Anexo A
  amount: string | number;    // sin ITBIS
  itbis: string | number;
  itbisRetained: string | number;
  itbisProportionality: string | number;
  isrRetained: string | number;
  isc: string | number;
  otherTaxes: string | number;
  tip: string | number;
  lineas: LineaDeCompra606[];
}

/** Numero de campos del detalle segun el Anexo A. */
export const CAMPOS_DETALLE_606 = 23;

/** Tipo de bienes y servicios que, sin lineas, cuenta como BIENES. */
export const TIPO_GASTO_BIENES_606 = '09';

/** Forma de pago "compra a credito" del Anexo A. */
export const FORMA_PAGO_CREDITO_606 = '04';

const n = (v: string | number) => parseFloat(String(v)) || 0;
const centimos = (v: number) => Math.round(v * 100) / 100;

/** Una compra sin NCF no va al detalle: la linea no seria valida. */
export function vaEnElDetalle606(c: { ncf: string | null }): boolean {
  return !!c.ncf && c.ncf.trim() !== '';
}

/** Cuanto del monto facturado es de servicios y cuanto de bienes. Suman el monto. */
export function repartoServiciosBienes606(c: Pick<Compra606, 'amount' | 'expenseType' | 'lineas'>): { servicios: number; bienes: number } {
  const monto = centimos(n(c.amount));
  if (c.lineas.length > 0) {
    const bienes = centimos(Math.min(monto, c.lineas.filter((l) => l.productId).reduce((s, l) => s + n(l.subtotal), 0)));
    return { servicios: centimos(monto - bienes), bienes };
  }
  return c.expenseType === TIPO_GASTO_BIENES_606 ? { servicios: 0, bienes: monto } : { servicios: monto, bienes: 0 };
}

/** AAAA-MM-DD de la fecha de pago, o '' si no se sabe. */
export function fechaDePago606(c: Pick<Compra606, 'paymentDate' | 'issueDate' | 'paymentMethod'>): string {
  if (c.paymentDate) return c.paymentDate;
  return c.paymentMethod === FORMA_PAGO_CREDITO_606 ? '' : c.issueDate;
}

/** `606|RNC|AAAAMM|cantidad`. El RNC, solo digitos. `periodo` en AAAA-MM. */
export function cabecera606(rncEmisor: string, periodo: string, cantidadRegistros: number): string {
  return ['606', rncEmisor.replace(/\D/g, ''), periodo.replace('-', ''), String(cantidadRegistros)].join('|');
}

/** El nombre que da la herramienta de la DGII: `DGII_F_606_<RNC>_<AAAAMM>.TXT`. */
export function nombreFichero606(rncEmisor: string, periodo: string): string {
  return `DGII_F_606_${rncEmisor.replace(/\D/g, '')}_${periodo.replace('-', '')}.TXT`;
}

/** Una linea de detalle: los 23 campos del Anexo A, en su orden. */
export function lineaDetalle606(c: Compra606): string {
  const rnc = (c.supplierRnc || '').replace(/\D/g, '').substring(0, 11);
  const tipoId = rnc.length === 9 ? '1' : rnc.length === 11 ? '2' : '';
  const aaaammdd = (fecha: string) => fecha.replace(/-/g, '');
  const { servicios, bienes } = repartoServiciosBienes606(c);
  const itbis = n(c.itbis);

  const campos = [
    rnc,                                   // 1  RNC o Cedula del proveedor
    tipoId,                                // 2  Tipo Id (1 RNC, 2 Cedula)
    c.expenseType,                         // 3  Tipo Bienes y Servicios Comprados
    (c.ncf ?? '').trim(),                  // 4  NCF
    (c.ncfModified ?? '').trim(),          // 5  NCF o Documento Modificado
    aaaammdd(c.issueDate),                 // 6  Fecha Comprobante
    aaaammdd(fechaDePago606(c)),           // 7  Fecha Pago
    importeDgii(servicios),                // 8  Monto Facturado en Servicios
    importeDgii(bienes),                   // 9  Monto Facturado en Bienes
    importeDgii(servicios + bienes),       // 10 Total Monto Facturado
    importeDgii(itbis),                    // 11 ITBIS Facturado
    importeDgii(c.itbisRetained),          // 12 ITBIS Retenido
    importeDgii(c.itbisProportionality),   // 13 ITBIS sujeto a Proporcionalidad
    '',                                    // 14 ITBIS llevado al Costo (no se registra)
    importeDgii(itbis),                    // 15 ITBIS por Adelantar (facturado - llevado al costo)
    '',                                    // 16 ITBIS percibido en compras (no habilitado)
    '',                                    // 17 Tipo de Retencion en ISR (no se registra)
    importeDgii(c.isrRetained),            // 18 Monto Retencion Renta
    '',                                    // 19 ISR Percibido en compras (no habilitado)
    importeDgii(c.isc),                    // 20 Impuesto Selectivo al Consumo
    importeDgii(c.otherTaxes),             // 21 Otros Impuestos/Tasas
    importeDgii(c.tip),                    // 22 Monto Propina Legal
    c.paymentMethod,                       // 23 Forma de Pago
  ];
  return campos.join('|');
}

/** El fichero entero. Las compras sin NCF no van; la cabecera cuenta lo que va. */
export function txtDel606(p: { rncEmisor: string; periodo: string; compras: Compra606[] }): string {
  const lineas = p.compras.filter(vaEnElDetalle606).map(lineaDetalle606);
  return cabecera606(p.rncEmisor, p.periodo, lineas.length) + '\n' + lineas.join('\n') + (lineas.length > 0 ? '\n' : '');
}
