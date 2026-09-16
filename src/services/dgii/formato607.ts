/**
 * El fichero TXT del Formato 607 (ventas y operaciones), tal y como lo define
 * la Norma General 07-2018 de la DGII, Anexo B.
 *
 * POR QUE EXISTE (lote 142)
 * -------------------------
 * El TXT se armaba dentro de la ruta y no cumplia el Anexo B en tres cosas que,
 * juntas, hacen el fichero inservible o falso:
 *
 *   1. CABECERA. La norma pide `607|RNC|AAAAMM|cantidad de registros`. Salia
 *      `607|<uuid interno de la empresa>|AAAAMM`: sin RNC y sin cantidad.
 *   2. COLUMNAS. El detalle tiene 23 campos. Salian 27: tras el campo 10 se
 *      colaban cuatro que son del 606 (ITBIS sujeto a proporcionalidad, por
 *      presuncion, llevado al costo, por adelantar), y todo lo que venia detras
 *      -- retencion de ISR, impuestos, las siete formas de pago -- caia cuatro
 *      posiciones mas alla de donde la DGII lo lee.
 *   3. IMPORTES. "Incluir el punto decimal para expresar cifras con centavos",
 *      dice la norma en cada campo de monto. Se quitaba el punto: 13.610,66
 *      salia `1361066`, que se lee como cien veces mas. Medido el 2026-09-16:
 *      46 de los 53 comprobantes de PRODUCCION tienen centavos.
 *
 * El texto de la norma y del instructivo esta en
 * `scratch/_to_delete/referencia_dgii/` (fuera del repositorio).
 *
 * LO QUE SE CONSERVA TAL CUAL, A PROPOSITO (cada uno pide su propia medicion)
 * --------------------------------------------------------------------------
 *   - Campo 4, NCF modificado: sigue vacio, tambien en las notas de credito.
 *   - Campo 6, fecha: sale de `toISOString()`, en UTC.
 *   - Campo 5, tipo de ingreso: '01'.
 *   - Campo 2 con RNC vacio: '3' (pasaporte).
 *   - Campo 15, otros impuestos o tasas: recibe las retenciones de tipo OTRA,
 *     como antes. Medido: cero retenciones en ventas en toda la base.
 * Este modulo cambia la FORMA del fichero, no lo que se decide declarar.
 */

/*
 * FACTURAS DE CONSUMO (lote 143)
 * ------------------------------
 * NG 07-2018, art. 4: en el detalle del 607 van las facturas de credito fiscal y
 * los comprobantes especiales; las de CONSUMO "solo cuando tengan un valor igual
 * o superior" al umbral, que la NG 10-18 fijo en RD$250.000 desde julio de 2018.
 * Y el parrafo I: el total de TODAS las de consumo, incluidas las que superan el
 * umbral, se declara aparte, "a modo de resumen", en el modulo "Resumen General
 * de Facturas de Consumo (F.C.)" de la Oficina Virtual.
 *
 * El TXT las metia todas. Medido el 2026-09-16: 31 e-32 en PRODUCCION de julio
 * a septiembre, la mayor de 147.256,81, todas sin RNC -- en el detalle con
 * identificacion vacia y tipo 3. Ninguna debia ir.
 *
 * Dos lecturas que decide el contador, y que hoy no mueven ningun caso:
 *   - "valor": se toma el TOTAL del comprobante. Medido: ninguna e-32 entre
 *     200.000 y 300.000, asi que da igual con o sin ITBIS.
 *   - Las notas de credito o debito sobre una factura de consumo que no va en el
 *     detalle: la norma no lo dice y NO se tocan (siguen en el detalle, como
 *     antes). Medido: una sola, en PRUEBA.
 */

/** Umbral de la NG 10-18 para que una factura de consumo vaya en el detalle del 607. */
export const UMBRAL_FACTURA_CONSUMO_607 = 250000;

/** Tipos de comprobante que son facturas de consumo. En e-CF, solo la e-32. */
export const TIPOS_FACTURA_CONSUMO = ['32'];

export const esFacturaDeConsumo = (ecfType: string): boolean => TIPOS_FACTURA_CONSUMO.includes(ecfType);

/** Si el comprobante va en el detalle del TXT del 607. */
export function vaEnElDetalle607(c: { ecfType: string; total: string | number }): boolean {
  if (!esFacturaDeConsumo(c.ecfType)) return true;
  return parseFloat(String(c.total)) >= UMBRAL_FACTURA_CONSUMO_607;
}

export interface ResumenFacturasConsumo607 {
  /** Cantidad de NCF de facturas de consumo emitidas en el periodo. */
  cantidad: number;
  /** Monto facturado, sin ITBIS (subtotal menos descuento). */
  montoFacturado: number;
  itbisFacturado: number;
  total: number;
}

/** El resumen del parrafo I: TODAS las facturas de consumo, superen o no el umbral. */
export function resumenFacturasConsumo607(
  comprobantes: Array<{ ecfType: string; subtotal: string | number; discount: string | number; totalTaxes: string | number; total: string | number }>
): ResumenFacturasConsumo607 {
  const n = (v: string | number) => parseFloat(String(v)) || 0;
  const redondeo = (v: number) => Math.round(v * 100) / 100;
  const deConsumo = comprobantes.filter((c) => esFacturaDeConsumo(c.ecfType));
  return {
    cantidad: deConsumo.length,
    montoFacturado: redondeo(deConsumo.reduce((s, c) => s + n(c.subtotal) - n(c.discount), 0)),
    itbisFacturado: redondeo(deConsumo.reduce((s, c) => s + n(c.totalTaxes), 0)),
    total: redondeo(deConsumo.reduce((s, c) => s + n(c.total), 0)),
  };
}

export interface RetencionDeVenta607 {
  retentionType: string;
  retentionAmount: string | number;
  retentionDate: string | null;
}

export interface Comprobante607 {
  ncf: string;
  ecfType: string;
  subtotal: string | number;
  discount: string | number;
  totalTaxes: string | number;
  total: string | number;
  totalNet: string | number | null;
  paymentType: string;
  createdAt: Date;
  customerRnc: string | null;
  retenciones: RetencionDeVenta607[];
}

/** Numero de campos del detalle segun el Anexo B. */
export const CAMPOS_DETALLE_607 = 23;

/**
 * Un importe del 607: con punto decimal y dos decimales. Vacio si es cero,
 * negativo o no es numero, como se hacia antes (las casillas sin monto van en
 * blanco).
 */
export function importe607(valor: string | number): string {
  const num = parseFloat(String(valor));
  if (isNaN(num) || num <= 0) return '';
  return num.toFixed(2);
}

/** `607|RNC|AAAAMM|cantidad`. El RNC, solo digitos. `periodo` en AAAA-MM. */
export function cabecera607(rncEmisor: string, periodo: string, cantidadRegistros: number): string {
  const rnc = rncEmisor.replace(/\D/g, '');
  return ['607', rnc, periodo.replace('-', ''), String(cantidadRegistros)].join('|');
}

/** El nombre que da la herramienta de la DGII: `DGII_F_607_<RNC>_<AAAAMM>.TXT`. */
export function nombreFichero607(rncEmisor: string, periodo: string): string {
  return `DGII_F_607_${rncEmisor.replace(/\D/g, '')}_${periodo.replace('-', '')}.TXT`;
}

/** Una linea de detalle: los 23 campos del Anexo B, en su orden. */
export function lineaDetalle607(c: Comprobante607): string {
  const rnc = (c.customerRnc || '').replace(/\D/g, '').substring(0, 11);
  const idTipo = rnc.length === 9 ? '1' : rnc.length === 11 ? '2' : '3';
  const fechaFactura = c.createdAt.toISOString().substring(0, 10).replace(/-/g, '');

  const suma = (tipo: string) => c.retenciones
    .filter((r) => r.retentionType === tipo)
    .reduce((acc, r) => acc + parseFloat(String(r.retentionAmount)), 0);
  const itbisRet = suma('ITBIS');
  const isrRet = suma('ISR');
  const otrasRet = suma('OTRA');

  let fechaRet = '';
  if (c.retenciones.length > 0) {
    fechaRet = c.retenciones[0].retentionDate
      ? c.retenciones[0].retentionDate.replace(/-/g, '')
      : fechaFactura;
  }

  const montoFacturado = parseFloat(String(c.subtotal)) - parseFloat(String(c.discount));
  const itbisFacturado = parseFloat(String(c.totalTaxes));
  const cobrado = parseFloat(String(c.totalNet || c.total));

  // Forma de pago. "El monto digitado en estos campos incluye impuestos."
  const efectivo = c.paymentType === 'cash' ? importe607(cobrado) : '';
  const chequeTransferencia = c.paymentType === 'bank_transfer' ? importe607(cobrado) : '';
  const credito = c.paymentType === 'credit' ? importe607(cobrado) : '';
  const tarjeta = !['cash', 'bank_transfer', 'credit'].includes(c.paymentType) ? importe607(cobrado) : '';

  const campos = [
    rnc,                          // 1  RNC, Cedula o Pasaporte
    idTipo,                       // 2  Tipo Identificacion
    c.ncf.trim(),                 // 3  Numero Comprobante Fiscal
    '',                           // 4  Numero Comprobante Modificado
    '01',                         // 5  Tipo de Ingreso
    fechaFactura,                 // 6  Fecha Comprobante (AAAAMMDD)
    fechaRet,                     // 7  Fecha de Retencion (AAAAMMDD)
    importe607(montoFacturado),   // 8  Monto Facturado
    importe607(itbisFacturado),   // 9  ITBIS Facturado
    importe607(itbisRet),         // 10 ITBIS Retenido por Terceros
    '',                           // 11 ITBIS Percibido (no habilitado)
    importe607(isrRet),           // 12 Retencion de Renta por Terceros
    '',                           // 13 ISR Percibido (no habilitado)
    '',                           // 14 Impuesto Selectivo al Consumo
    importe607(otrasRet),         // 15 Otros Impuestos o Tasas
    '',                           // 16 Monto Propina Legal
    efectivo,                     // 17 Efectivo
    chequeTransferencia,          // 18 Cheque/Transferencia/Deposito
    tarjeta,                      // 19 Tarjeta Debito/Credito
    credito,                      // 20 Venta a Credito
    '',                           // 21 Bonos o Certificados de Regalo
    '',                           // 22 Permuta
    '',                           // 23 Otras Formas de Ventas
  ];
  return campos.join('|');
}

/**
 * El fichero entero: cabecera, detalle, y salto final si hay detalle. Las
 * facturas de consumo por debajo del umbral no van (lote 143): se declaran en
 * el resumen de la Oficina Virtual, y la cabecera cuenta solo lo que va.
 */
export function txtDel607(p: { rncEmisor: string; periodo: string; comprobantes: Comprobante607[] }): string {
  const lineas = p.comprobantes.filter(vaEnElDetalle607).map(lineaDetalle607);
  const cabecera = cabecera607(p.rncEmisor, p.periodo, lineas.length);
  return cabecera + '\n' + lineas.join('\n') + (lineas.length > 0 ? '\n' : '');
}
