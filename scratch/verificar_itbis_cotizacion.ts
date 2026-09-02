/**
 * La tasa de ITBIS sobrevive al paso de COTIZACION a FACTURA.
 *
 * EL FALLO
 * --------
 * Se emitia una cotizacion al 16% o exenta, se pasaba a factura, y la factura
 * salia al 18%.
 *
 * Es el cuarto camino del mismo agujero. La 0039 arreglo tres (envio directo,
 * borrador y nota de ajuste) anadiendo la tasa a `invoice_lines`. Este no,
 * porque la perdida ocurre antes: `quote_lines` tampoco tenia columna de tasa.
 *
 * Y aqui el codigo lo llevaba escrito. En `prepareInvoicePayload`:
 *
 *     // We need to fetch the taxRate from quoteTaxes or reconstruct it
 *     // We don't store taxRate per line directly, so frontend might need to
 *     // refetch it or we can compute it from unitPrice, subtotal and taxes.
 *
 * El payload de conversion no llevaba `taxRate`, y el formulario de facturas
 * ponia `taxRate: 0.18` a pelo al recibirlo.
 *
 * QUE SE COMPRUEBA
 * ----------------
 * La cadena de verdad: se crea una cotizacion con el servicio real, se lee de
 * la base, y se pide el payload de conversion que consume el formulario.
 */
import { db, quotes, quoteLines, quoteTaxes } from '../src/db';
import { sql, eq } from 'drizzle-orm';
import { QuoteService } from '../src/services/quoteService';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function limpiar() {
  const ids = (await db.execute(sql`
    SELECT id FROM quotes WHERE company_id = ${A}::uuid AND sequence_number LIKE 'COT-TEST-%'`)) as unknown as { id: string }[];
  for (const q of ids) {
    await db.delete(quoteTaxes).where(eq(quoteTaxes.quoteId, q.id));
    await db.delete(quoteLines).where(eq(quoteLines.quoteId, q.id));
    await db.delete(quotes).where(eq(quotes.id, q.id));
  }
}

/** Crea una cotizacion con la tasa dada y devuelve su id. */
async function cotizacionCon(tasa: number, sufijo: string): Promise<string> {
  const q = await QuoteService.createQuote({
    companyId: A, modo: 'PRODUCCION', userId: USER,
    lines: [{ productId: PROD, quantity: 1, unitPrice: 10000, discount: 0, taxRate: tasa }],
  } as any);
  const id = (q as any).id ?? (q as any).quoteId ?? q;
  await db.execute(sql`UPDATE quotes SET sequence_number = ${'COT-TEST-' + sufijo} WHERE id = ${id}::uuid`);
  return id;
}

async function main() {
  await limpiar();

  console.log('\n1) La columna existe y guarda FRACCION\n');

  const [col] = (await db.execute(sql`
    SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_name = 'quote_lines' AND column_name = 'tax_rate'`)) as unknown as any[];
  ok('quote_lines.tax_rate existe', !!col, col ? col.data_type : 'no existe');

  const [{ n: fuera }] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM quote_lines WHERE tax_rate IS NOT NULL AND (tax_rate < 0 OR tax_rate > 1)`)) as unknown as { n: number }[];
  ok('ninguna fuera de 0..1 (seria porcentaje colado)', fuera === 0, String(fuera));

  console.log('\n2) La cotizacion GUARDA la tasa que se eligio\n');

  for (const [etiq, tasa, suf] of [['18%', 0.18, 'A18'], ['16%', 0.16, 'A16'], ['exento', 0, 'A00']] as const) {
    const id = await cotizacionCon(tasa, suf);
    const [fila] = (await db.execute(sql`
      SELECT tax_rate FROM quote_lines WHERE quote_id = ${id}::uuid LIMIT 1`)) as unknown as { tax_rate: string | null }[];
    ok(`${etiq}: se guarda en quote_lines`,
      fila?.tax_rate != null && Math.abs(Number(fila.tax_rate) - tasa) < 1e-9,
      String(fila?.tax_rate));
  }

  console.log('\n3) El payload de conversion la DEVUELVE\n');

  for (const [etiq, tasa, suf] of [['18%', 0.18, 'B18'], ['16%', 0.16, 'B16'], ['exento', 0, 'B00']] as const) {
    const id = await cotizacionCon(tasa, suf);
    const payload = await QuoteService.prepareInvoicePayload(id, A, 'PRODUCCION');
    const recibida = (payload.lines[0] as any).taxRate;
    ok(`${etiq}: el payload trae ${tasa}`,
      recibida != null && Math.abs(Number(recibida) - tasa) < 1e-9, String(recibida));
  }

  console.log('\n4) Cotizacion VIEJA (sin tasa guardada): se deduce, no se inventa\n');

  // Una cotizacion anterior a la 0040: tasa nula, pero con UNA sola tasa en su
  // resumen. Es deducible.
  const vieja = await cotizacionCon(0.16, 'VIEJA');
  await db.execute(sql`UPDATE quote_lines SET tax_rate = NULL WHERE quote_id = ${vieja}::uuid`);
  const pv = await QuoteService.prepareInvoicePayload(vieja, A, 'PRODUCCION');
  ok('con una sola tasa en el resumen, se deduce 0.16',
    Math.abs(Number((pv.lines[0] as any).taxRate) - 0.16) < 1e-9, String((pv.lines[0] as any).taxRate));

  // Ahora con DOS tasas en el resumen: NO es deducible y debe venir null, para
  // que el formulario avise en vez de poner un 18% indistinguible de uno real.
  await db.execute(sql`
    INSERT INTO quote_taxes (quote_id, tax_type, rate, amount) VALUES (${vieja}::uuid, 'ITBIS', 18.00, 1)`);
  const pa = await QuoteService.prepareInvoicePayload(vieja, A, 'PRODUCCION');
  ok('con dos tasas, viene null (no consta) en vez de un 18% inventado',
    (pa.lines[0] as any).taxRate === null, String((pa.lines[0] as any).taxRate));

  console.log('\n5) El codigo ya no fuerza el 18% en ningun paso\n');

  const svc = fuente('src/services/quoteService.ts');
  ok('el servicio guarda la tasa al crear', /taxRate:\s*line\.taxRate/.test(svc));
  ok('y la devuelve en el payload', /taxRate:\s*\(line as any\)\.taxRate/.test(svc));
  ok('el select de lineas la trae', /taxRate:\s*quoteLines\.taxRate/.test(svc));

  // La comprobacion se ACOTA al bloque de conversion. La primera version
  // buscaba `taxRate: 0.18` seguido de `unitOfMeasure` en todo el fichero, y
  // eso caza tambien los valores por defecto LEGITIMOS de una linea nueva
  // (linea vacia inicial y "agregar linea"), que deben seguir en 18%.
  const fact = fuente('src/app/dashboard/invoices/page.tsx');
  //
  // La ventana va por LINEAS, no por caracteres. `fuente()` sustituye los
  // comentarios por espacios para no mover las posiciones, asi que un tramo de
  // N caracteres tras un bloque muy comentado es casi todo blanco y no llega
  // al codigo. Con el corte por caracteres esta comprobacion no veia nada y
  // fallaba sin que el codigo tuviera nada malo.
  const lineasFact = fact.split('\n');
  const iConv = lineasFact.findIndex(l => l.includes('/convert'));
  const bloqueConversion = iConv >= 0 ? lineasFact.slice(iConv, iConv + 60).join('\n') : '';
  ok('el bloque de conversion existe', iConv >= 0);
  ok('al convertir se usa la tasa de la cotizacion, no 0.18 fijo',
    /taxRate:\s*l\.taxRate\s*!=\s*null/.test(bloqueConversion) &&
    !/taxRate:\s*0\.18,/.test(bloqueConversion));
  ok('y se avisa cuando la tasa no consta', /no tienen ITBIS guardado/.test(fact));

  const edit = fuente('src/app/dashboard/quotes/[id]/edit/page.tsx');
  ok('editar una cotizacion conserva su tasa', /taxRate:\s*l\.taxRate\s*!=\s*null/.test(edit));
  ok('y el producto exento no se vuelve 18% (`??`)', !/product\.taxRate\s*\|\|\s*0\.18/.test(edit));

  await limpiar();
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
