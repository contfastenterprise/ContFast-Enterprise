/**
 * Lote 263 -- el XML del e-CF descuenta `cantidad x descuento por unidad`, como la factura.
 *
 * Revisando el calculo de la factura a peticion del dueño (2026-10-03) salio que el XML que firma
 * mSeller restaba el descuento UNA vez por linea (`cantidad x precio - descuento`), aunque el campo
 * es por unidad. La calculadora del servidor si multiplicaba, y de ella salen `TotalITBIS` y
 * `MontoTotal`: con cantidad > 1, el comprobante se contradecia por dentro. Medido: tres comprobantes
 * ACEPTADOS de Latin Doors lo llevan (E320000000043, E320000000046, E310000000012). No se tocan.
 *
 * Se EJECUTA el camino de verdad: la calculadora calcula los totales y con ellos se arma el XML,
 * como en `invoiceSubmissionService`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_descuento_del_xml.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MSellerClient } from '../src/services/dgii/msellerClient';
import { InvoiceCalculator } from '../src/services/invoice/invoiceCalculator';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Linea = { nombre: string; cantidad: number; precio: number; descuento: number; tasa: number };

/** Lo que hace `invoiceSubmissionService`: totales de la calculadora, y con ellos el XML. */
function emitir(lineas: Linea[]): { totales: AnyRec; enc: AnyRec; items: AnyRec[] } {
  const totales = InvoiceCalculator.calculateTotalsAndRetentions({
    lines: lineas.map((l) => ({ productId: l.nombre, productName: l.nombre, quantity: l.cantidad, unitPrice: l.precio, discount: l.descuento, taxRate: l.tasa })),
    retentions: [],
  } as never) as AnyRec;
  const payload = MSellerClient.buildECFPayload({
    ncf: 'E310000000099', ecfType: '31', sequenceExpiry: '31-12-2026', paymentType: '1',
    issueDate: new Date('2026-10-03T10:00:00'),
    emitterRnc: '131793916', emitterName: 'Empresa', emitterAddress: 'Santiago',
    buyerRnc: '101010101', buyerName: 'Cliente',
    subtotal: totales.subtotal - totales.totalDiscount, totalTaxes: totales.totalTaxes, total: totales.total,
    lines: (totales.itemLines as AnyRec[]).map((l, i) => ({
      index: i + 1, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, taxRate: l.taxRate, taxCategory: null,
    })),
  });
  return { totales, enc: payload.ECF.Encabezado as AnyRec, items: payload.ECF.DetallesItems.Item as AnyRec[] };
}

function main() {
  console.log('\n1) El caso real: E310000000012 (40 x 440, descuento de RD$ 100,50 por unidad)\n');
  {
    const { totales, enc, items } = emitir([{ nombre: 'Puerta', cantidad: 40, precio: 440, descuento: 100.5, tasa: 0.18 }]);
    const t = enc.Totales;
    ok('el descuento del item es el total de la linea (40 x 100,50 = 4.020)', items[0].DescuentoMonto === 4020
      && items[0].TablaSubDescuento?.SubDescuento?.[0]?.MontoSubDescuento === 4020, String(items[0].DescuentoMonto));
    ok('  y el monto del item, 17.600 - 4.020 = 13.580', items[0].MontoItem === 13580, String(items[0].MontoItem));
    ok('el monto gravado del XML es la base de la factura (subtotal - descuento)',
      t.MontoGravadoI1 === 13580 && t.MontoGravadoTotal === 13580 && totales.subtotal - totales.totalDiscount === 13580,
      `gravado=${t.MontoGravadoI1} factura=${totales.subtotal - totales.totalDiscount}`);
    ok('  el ITBIS del tramo cuadra con el ITBIS total (18 % de 13.580 = 2.444,40)',
      t.TotalITBIS1 === 2444.4 && Number(t.TotalITBIS) === 2444.4, `ITBIS1=${t.TotalITBIS1} TotalITBIS=${t.TotalITBIS}`);
    //  Contra los propios montos del XML, no contra numeros fijos: `MontoTotal` sale de la
    //  calculadora y siempre fue bien; lo que no cuadraba era el gravado del mismo comprobante.
    ok('  y el total del XML es SU gravado + SU ITBIS',
      Number(t.MontoTotal) === Math.round((Number(t.MontoGravadoTotal) + Number(t.TotalITBIS)) * 100) / 100,
      `${t.MontoTotal} vs ${t.MontoGravadoTotal} + ${t.TotalITBIS}`);
  }

  console.log('\n2) Varias lineas y tasas: cada tramo suma lo que suman sus items\n');
  {
    const { enc, items } = emitir([
      { nombre: 'A', cantidad: 2, precio: 3016.45, descuento: 100, tasa: 0.18 },
      { nombre: 'B', cantidad: 3, precio: 164.45, descuento: 1.3, tasa: 0.18 },
      { nombre: 'C', cantidad: 5, precio: 200, descuento: 10, tasa: 0.16 },
      { nombre: 'D', cantidad: 4, precio: 50, descuento: 2.5, tasa: 0 },
    ]);
    const t = enc.Totales;
    const suma = (ind: string) => Math.round(items.filter((i) => i.IndicadorFacturacion === ind).reduce((s, i) => s + i.MontoItem, 0) * 100) / 100;
    ok('tramo 18 %: items 5.832,90 + 489,45 = gravado del tramo', suma('1') === 6322.35 && t.MontoGravadoI1 === 6322.35, `${suma('1')} vs ${t.MontoGravadoI1}`);
    ok('tramo 16 %: 5 x (200 - 10) = 950', suma('2') === 950 && t.MontoGravadoI2 === 950, `${suma('2')} vs ${t.MontoGravadoI2}`);
    ok('exento: 4 x (50 - 2,50) = 190', suma('4') === 190 && t.MontoExento === 190, `${suma('4')} vs ${t.MontoExento}`);
    const itbisTramos = Math.round(((t.TotalITBIS1 ?? 0) + (t.TotalITBIS2 ?? 0)) * 100) / 100;
    ok('la suma del ITBIS de los tramos es el ITBIS total del comprobante', itbisTramos === Number(t.TotalITBIS), `${itbisTramos} vs ${t.TotalITBIS}`);
  }

  console.log('\n3) Lo que no cambia (invariantes)\n');
  {
    const { enc, items } = emitir([{ nombre: 'Uno', cantidad: 1, precio: 1000, descuento: 50, tasa: 0.18 }]);
    invariante('con cantidad 1 el XML es el de siempre (1.000 - 50 = 950)', items[0].MontoItem === 950 && items[0].DescuentoMonto === 50 && enc.Totales.MontoGravadoI1 === 950);
    const { items: sin } = emitir([{ nombre: 'Sin', cantidad: 3, precio: 100, descuento: 0, tasa: 0.18 }]);
    invariante('sin descuento no sale DescuentoMonto, y el item es cantidad x precio', sin[0].DescuentoMonto === undefined && sin[0].MontoItem === 300);
    const c = InvoiceCalculator.calculateTotalsAndRetentions({ lines: [{ productId: 'x', productName: 'x', quantity: 40, unitPrice: 440, discount: 100.5, taxRate: 0.18 }], retentions: [] } as never) as AnyRec;
    invariante('la calculadora da lo de siempre (subtotal 17.600, descuento 4.020, ITBIS 2.444,40)',
      c.subtotal === 17600 && c.totalDiscount === 4020 && c.totalTaxes === 2444.4 && c.total === 16024.4);
  }

  console.log('\n4) Una sola regla para los dos\n');
  const xml = sinComentarios(leer('src/services/dgii/msellerClient.ts'));
  const calc = sinComentarios(leer('src/services/invoice/invoiceCalculator.ts'));
  ok('el XML y la calculadora usan la misma regla de la linea (importesDeLinea)',
    /import \{ importesDeLinea \} from '@\/services\/invoice\/importesDeLinea'/.test(xml) && /importesDeLinea\(/.test(xml)
    && /import \{ importesDeLinea \} from '\.\/importesDeLinea'/.test(calc) && /importesDeLinea\(line\)/.test(calc)
    && !/quantity \* l\.unitPrice - \(l\.discount/.test(xml) && !/subtotal - discount\)/.test(xml));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main();
