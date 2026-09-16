/**
 * Las facturas de consumo por debajo del umbral no van en el detalle del 607, y
 * su total se ofrece para el resumen de la Oficina Virtual.
 *
 * LA NORMA (lote 143)
 * -------------------
 * NG 07-2018, art. 4: en el detalle, las de consumo "solo cuando tengan un valor
 * igual o superior" al umbral, que la NG 10-18 fijo en RD$250.000. Parrafo I:
 * el total de TODAS las de consumo se declara aparte, en el modulo "Resumen
 * General de Facturas de Consumo" de la Oficina Virtual.
 *
 * EL FALLO. El TXT metia todas. Medido el 2026-09-16: 31 e-32 en PRODUCCION de
 * julio a septiembre, la mayor de 147.256,81, todas sin RNC. Ninguna debia ir.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

const comprobante = (ncf: string, ecfType: string, subtotal: number, itbis: number, extra: Record<string, unknown> = {}) => ({
  ncf, ecfType, subtotal: subtotal.toFixed(2), discount: '0.00', totalTaxes: itbis.toFixed(2), total: (subtotal + itbis).toFixed(2),
  totalNet: (subtotal + itbis).toFixed(2), paymentType: 'cash', createdAt: new Date('2026-08-10T15:00:00Z'),
  customerRnc: null as string | null, retenciones: [], ...extra,
});

async function main() {
  console.log('\n0) Precondiciones: el 607 del lote 142 sigue igual\n');
  const RUTA_TXT = 'src/app/api/v1/reports/607/txt/route.ts';
  const LIBRO = 'src/app/api/v1/reports/sales-book/route.ts';
  const PANTALLA = 'src/app/dashboard/reports/607/page.tsx';
  exige('el TXT se arma con txtDel607 y el RNC de la empresa', /txtDel607\(\{\s*rncEmisor: empresa\.rnc,/.test(fuente(RUTA_TXT)));
  exige('el libro de ventas saca rechazados, borradores y anulados', /notInArray\(invoices\.status, ESTADOS_FUERA_DEL_607\)/.test(fuente(LIBRO)));

  const f = await import('../src/services/dgii/formato607');
  const hay = (nombre: string) => typeof (f as Record<string, unknown>)[nombre] === 'function';
  exige('el modulo del 607 existe y arma el fichero', typeof f.txtDel607 === 'function');

  console.log('\n1) El umbral y que es una factura de consumo\n');
  const g = f as Record<string, unknown>;
  ok('umbral RD$250.000 (NG 10-18)', g.UMBRAL_FACTURA_CONSUMO_607 === 250000, String(g.UMBRAL_FACTURA_CONSUMO_607));
  ok('factura de consumo = e-32', JSON.stringify(g.TIPOS_FACTURA_CONSUMO) === JSON.stringify(['32']));

  console.log('\n2) Que va en el detalle\n');
  const va = hay('vaEnElDetalle607') ? (g.vaEnElDetalle607 as (c: { ecfType: string; total: string | number }) => boolean) : null;
  ok('e-32 de 147.256,81 (la mayor medida): NO va', !!va && va({ ecfType: '32', total: '147256.81' }) === false);
  ok('e-32 de 249.999,99: NO va', !!va && va({ ecfType: '32', total: 249999.99 }) === false);
  ok('e-32 de 250.000,00 justo: SI va ("igual o superior")', !!va && va({ ecfType: '32', total: '250000.00' }) === true);
  ok('los demas tipos van siempre, sea cual sea el importe',
    !!va && ['31', '33', '34', '41', '43', '44', '45', '46', '47'].every((t) => va({ ecfType: t, total: 10 }) === true));

  console.log('\n3) El fichero\n');
  const lote = [
    comprobante('E310000000100', '31', 50000, 9000, { customerRnc: '131204619', paymentType: 'credit' }),
    comprobante('E320000000100', '32', 100000, 18000),
    comprobante('E320000000101', '32', 220000, 39600, { customerRnc: '00112345678' }),
    comprobante('E340000000100', '34', 1000, 180, { customerRnc: '131204619' }),
  ];
  const txt = f.txtDel607({ rncEmisor: '132796845', periodo: '2026-08', comprobantes: lote as never });
  const lineas = txt.split('\n').filter((l) => l !== '');
  ok('la cabecera cuenta solo lo que va: 3', lineas[0] === '607|132796845|202608|3', lineas[0]);
  ok('la e-32 pequeña no esta en el detalle', !txt.includes('E320000000100'));
  //  Estas dos valian tambien antes del lote -- entraba todo --, asi que no
  //  miden el arreglo: son precondiciones de que no se quita de mas.
  exige('la e-32 de 259.600 (>= umbral) sigue en el detalle', txt.includes('E320000000101'));
  exige('credito fiscal y nota de credito siguen en el detalle', txt.includes('E310000000100') && txt.includes('E340000000100'));
  ok('un mes solo con consumo pequeño: cabecera con 0 y nada mas',
    f.txtDel607({ rncEmisor: '132796845', periodo: '2026-08', comprobantes: [comprobante('E320000000102', '32', 900, 162)] as never }) === '607|132796845|202608|0\n');

  console.log('\n4) El resumen de la Oficina Virtual: TODAS las de consumo\n');
  const resumen = hay('resumenFacturasConsumo607')
    ? (g.resumenFacturasConsumo607 as (c: unknown[]) => { cantidad: number; montoFacturado: number; itbisFacturado: number; total: number })(lote)
    : null;
  ok('cuenta las dos e-32, tambien la que supera el umbral (parrafo I)', resumen?.cantidad === 2, JSON.stringify(resumen));
  ok('monto facturado sin ITBIS: 320.000', resumen?.montoFacturado === 320000);
  ok('ITBIS: 57.600', resumen?.itbisFacturado === 57600);
  ok('total: 377.600', resumen?.total === 377600);
  const conDescuento = hay('resumenFacturasConsumo607')
    ? (g.resumenFacturasConsumo607 as (c: unknown[]) => { montoFacturado: number; total: number })([
      { ecfType: '32', subtotal: '0.10', discount: '0.00', totalTaxes: '0', total: '0.10' },
      { ecfType: '32', subtotal: '100.20', discount: '0.10', totalTaxes: '0', total: '100.10' },
    ])
    : null;
  ok('resta el descuento y redondea a centimos', conDescuento?.montoFacturado === 100.2, JSON.stringify(conDescuento));

  console.log('\n5) Llega a la pantalla\n');
  const libro = fuente(LIBRO);
  ok('el libro de ventas devuelve el resumen, con la misma funcion',
    libro.includes("import { resumenFacturasConsumo607 } from '@/services/dgii/formato607';")
    && /resumenFacturasConsumo: resumenFacturasConsumo607\(list\),/.test(libro));
  const pantalla = fuente(PANTALLA);
  ok('la pantalla lo guarda de la respuesta', /setResumenConsumo\(data\.data\.resumenFacturasConsumo \|\| RESUMEN_VACIO\)/.test(pantalla));
  ok('y ensena las cuatro cifras', ['resumenConsumo.cantidad', 'resumenConsumo.montoFacturado', 'resumenConsumo.itbisFacturado', 'resumenConsumo.total'].every((x) => pantalla.includes(x)));
  ok('marca en la tabla lo que va solo al resumen, con la misma regla', /!vaEnElDetalle607\(e\)/.test(pantalla));
  ok('el umbral que enseña sale de la constante, no de un numero escrito',
    pantalla.includes('UMBRAL_FACTURA_CONSUMO_607') && !/250[.,]?000/.test(pantalla));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
