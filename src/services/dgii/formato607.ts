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
 *   - Campo 2 con RNC vacio: '3' (pasaporte). Y las facturas de consumo van
 *     todas, cuando el instructivo solo pide las de RD$250.000 o mas.
 *   - Campo 15, otros impuestos o tasas: recibe las retenciones de tipo OTRA,
 *     como antes. Medido: cero retenciones en ventas en toda la base.
 * Este modulo cambia la FORMA del fichero, no lo que se decide declarar.
 */

export interface RetencionDeVenta607 {
  retentionType: string;
  retentionAmount: string | number;
  retentionDate: string | null;
}

export interface Comprobante607 {
  ncf: string;
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

/** El fichero entero: cabecera, detalle, y salto final si hay detalle. */
export function txtDel607(p: { rncEmisor: string; periodo: string; comprobantes: Comprobante607[] }): string {
  const lineas = p.comprobantes.map(lineaDetalle607);
  const cabecera = cabecera607(p.rncEmisor, p.periodo, lineas.length);
  return cabecera + '\n' + lineas.join('\n') + (lineas.length > 0 ? '\n' : '');
}
