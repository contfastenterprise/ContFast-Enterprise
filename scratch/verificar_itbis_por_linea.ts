/**
 * La tasa de ITBIS que se elige es la que se guarda, la que se imprime y la
 * que se le declara a la DGII.
 *
 * EL FALLO
 * --------
 * Se elegia 16% o 0% exento y al imprimir salia 18%. Reproducido antes de
 * tocar nada (scratch/reproducir_itbis.ts):
 *
 *     elegida     -> navegador -> se guarda -> se imprime
 *     18% ITBIS   -> 18%       -> 18%       -> 18%   OK
 *     16% ITBIS   -> 16%       -> 16%       -> 16%   OK
 *     0%  Exento  -> 18%       -> 18%       -> 18%   MAL
 *
 * La causa de fondo era que `invoice_lines` NO TENIA columna de tasa. Solo
 * quedaba el resumen agregado de `invoice_taxes`, con el que no se puede saber
 * a que tasa fue cada linea. Todo lo de aguas abajo se la inventaba:
 *
 *   - al recuperar un BORRADOR el formulario forzaba `taxRate: 0.18`;
 *   - la nota de ajuste leia `line.taxRate`, siempre vacio -> 0.18;
 *   - al enviar, `Number(l.taxRate || 0.18)` -- y 0 es falso en JavaScript --
 *     convertia la tasa 0 en 18% ANTES de salir del navegador;
 *   - la plantilla cogia la PRIMERA tasa del resumen y la aplicaba a TODAS las
 *     lineas, con `?.rate ? ... : 0.18` (misma trampa del cero).
 *
 * Y aparte, en el comprobante que se manda a la DGII:
 *
 *   const itbisRate = 18;   ->   ITBIS1: itbisRate
 *   MontoExento: 0
 *
 * Una factura al 16% se DECLARABA al 18%, y una exenta como gravada.
 */
import { InvoiceCalculator } from '../src/services/invoice/invoiceCalculator';
import { MSellerClient } from '../src/services/dgii/msellerClient';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const linea = (precio: number, tasa: number) =>
  ({ productId: 'p', productName: 'Art', quantity: 1, unitPrice: precio, discount: 0, taxRate: tasa });

const ecf = (lineas: any[], subtotal: number, totalTaxes: number, total: number) =>
  MSellerClient.buildECFPayload({
    ncf: 'E310000000001', ecfType: '31', sequenceExpiry: '31-12-2027', paymentType: '1',
    issueDate: new Date('2026-08-29'), emitterRnc: '101010101', emitterName: 'Emisor',
    emitterAddress: 'RD', subtotal, totalTaxes, total, lines: lineas,
  } as any);

const totalesDe = (p: any) => (p as any).ECF?.Encabezado?.Totales ?? (p as any).Encabezado?.Totales;

async function main() {
  console.log('\n1) La columna existe y guarda FRACCION, no porcentaje\n');

  const [col] = (await db.execute(sql`
    SELECT data_type, numeric_precision, numeric_scale, is_nullable
      FROM information_schema.columns
     WHERE table_name = 'invoice_lines' AND column_name = 'tax_rate'`)) as unknown as any[];
  ok('invoice_lines.tax_rate existe', !!col, col ? `${col.data_type}(${col.numeric_precision},${col.numeric_scale})` : 'no existe');
  ok('admite nulo (facturas viejas no deducibles)', col?.is_nullable === 'YES');

  // Las DOS tablas usan unidades distintas y es facil mezclarlas. Se fijan aqui
  // para que un cambio futuro lo note.
  const [{ n: fueraDeRango }] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM invoice_lines WHERE tax_rate IS NOT NULL AND (tax_rate < 0 OR tax_rate > 1)`)) as unknown as { n: number }[];
  ok('ninguna tasa fuera de 0..1 (seria porcentaje colado)', fueraDeRango === 0, String(fueraDeRango));

  console.log('\n2) El calculador respeta cada tasa\n');

  for (const [etiq, tasa] of [['18%', 0.18], ['16%', 0.16], ['0% exento', 0]] as const) {
    const t = InvoiceCalculator.calculateTotalsAndRetentions({ lines: [linea(1000, tasa)] } as any);
    const esperado = 1000 * tasa;
    ok(`${etiq}: ITBIS = ${esperado}`, Math.abs(t.totalTaxes - esperado) < 0.001, String(t.totalTaxes));
    ok(`${etiq}: la linea conserva su tasa`, t.itemLines[0].taxRate === tasa, String(t.itemLines[0].taxRate));
  }

  console.log('\n3) El codigo ya no convierte el 0 en 18%\n');

  const front = fuente('src/app/dashboard/invoices/page.tsx');
  ok('al enviar se usa `??`, no `||`', !/taxRate:\s*Number\(l\.taxRate\s*\|\|/.test(front));
  ok('el borrador ya no fuerza 0.18', !/discount: parseFloat\(l\.discount\) \|\| 0,\s*\n\s*taxRate: 0\.18,/.test(front));
  ok('la nota de ajuste tampoco', !/taxRate:\s*Number\(line\.taxRate\s*\|\|/.test(front));

  const plantilla = fuente('src/utils/templates/documentTemplates.ts');
  ok('la plantilla usa la tasa de la linea', /line\.taxRate\s*!=\s*null/.test(plantilla));
  ok('y ya no tiene el `?.rate ? ... : 0.18`',
    !/\?\.rate\s*\n?\s*\?\s*Number\([^)]*\)\s*\/\s*100\s*:\s*0\.18/.test(plantilla.replace(/\s+/g, ' ')));

  const repo = fuente('src/repositories/invoiceRepository.ts');
  ok('el repositorio guarda la tasa', /taxRate:\s*line\.taxRate/.test(repo));
  const borrador = fuente('src/app/api/v1/invoices/draft/route.ts');
  ok('el borrador tambien la guarda', /taxRate:\s*line\.taxRate/.test(borrador));

  console.log('\n4) El e-CF de la DGII declara la tasa REAL\n');

  // 4a. El caso corriente NO cambia. Esto es lo que protege los envios que hoy
  //     funcionan: con todo al 18% el bloque tiene que salir igual que antes.
  const soloDieciocho = totalesDe(ecf([linea(1000, 0.18), linea(500, 0.18)], 1500, 270, 1770));
  ok('18% en todo: ITBIS1 = 18', soloDieciocho.ITBIS1 === 18, String(soloDieciocho.ITBIS1));
  ok('18% en todo: MontoGravadoTotal = 1500', soloDieciocho.MontoGravadoTotal === 1500, String(soloDieciocho.MontoGravadoTotal));
  ok('18% en todo: MontoGravadoI1 = 1500', soloDieciocho.MontoGravadoI1 === 1500, String(soloDieciocho.MontoGravadoI1));
  ok('18% en todo: MontoExento = 0', soloDieciocho.MontoExento === 0, String(soloDieciocho.MontoExento));
  ok('18% en todo: TotalITBIS = 270', soloDieciocho.TotalITBIS === 270, String(soloDieciocho.TotalITBIS));
  ok('18% en todo: no aparece un segundo tramo', soloDieciocho.ITBIS2 === undefined);

  // 4b. 16%: antes se declaraba 18.
  const dieciseis = totalesDe(ecf([linea(1000, 0.16)], 1000, 160, 1160));
  ok('16%: ITBIS1 = 16 (antes declaraba 18)', dieciseis.ITBIS1 === 16, String(dieciseis.ITBIS1));
  ok('16%: TotalITBIS1 = 160', dieciseis.TotalITBIS1 === 160, String(dieciseis.TotalITBIS1));

  // 4c. Exento: antes iba como gravado al 18 con MontoExento 0.
  const exento = totalesDe(ecf([linea(1000, 0)], 1000, 0, 1000));
  ok('exento: MontoExento = 1000 (antes 0)', exento.MontoExento === 1000, String(exento.MontoExento));
  ok('exento: MontoGravadoTotal = 0', exento.MontoGravadoTotal === 0, String(exento.MontoGravadoTotal));
  ok('exento: no se declara ningun tramo de ITBIS', exento.ITBIS1 === undefined);
  ok('exento: TotalITBIS = 0', exento.TotalITBIS === 0, String(exento.TotalITBIS));

  // 4d. Mezcla gravado + exento.
  const mixto = totalesDe(ecf([linea(1000, 0.18), linea(500, 0)], 1500, 180, 1680));
  ok('mixto: gravado 1000 y exento 500', mixto.MontoGravadoTotal === 1000 && mixto.MontoExento === 500,
    `gravado ${mixto.MontoGravadoTotal}, exento ${mixto.MontoExento}`);

  // 4e. Dos tasas gravadas: dos tramos, el mayor primero.
  const dosTasas = totalesDe(ecf([linea(1000, 0.18), linea(1000, 0.16)], 2000, 340, 2340));
  ok('dos tasas: ITBIS1 = 18 y ITBIS2 = 16', dosTasas.ITBIS1 === 18 && dosTasas.ITBIS2 === 16,
    `${dosTasas.ITBIS1} / ${dosTasas.ITBIS2}`);
  ok('dos tasas: cada tramo con su base', dosTasas.MontoGravadoI1 === 1000 && dosTasas.MontoGravadoI2 === 1000);
  ok('dos tasas: cada tramo con su importe', dosTasas.TotalITBIS1 === 180 && dosTasas.TotalITBIS2 === 160,
    `${dosTasas.TotalITBIS1} / ${dosTasas.TotalITBIS2}`);

  // 4f. Mas de tres tasas: se LANZA, no se aproxima.
  let mensaje = '';
  try {
    ecf([linea(100, 0.18), linea(100, 0.16), linea(100, 0.10), linea(100, 0.05)], 400, 49, 449);
  } catch (e: any) { mensaje = e.message; }
  ok('cuatro tasas: lanza en vez de declarar algo aproximado',
    /solo admite tres/.test(mensaje), mensaje.slice(0, 80) || 'NO lanzo');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
