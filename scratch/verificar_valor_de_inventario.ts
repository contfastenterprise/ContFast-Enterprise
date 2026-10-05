/**
 * Lote 291 -- la tarjeta "Valor de Inventario" de Productos, y los botones "Excel" que bajan un CSV.
 *
 *   1. La tarjeta sumaba `cost` de la PAGINA visible y sin multiplicar por la existencia. Ahora es el
 *      catalogo entero, existencia x COSTO PROMEDIO del kardex (`valorDelInventario`, pura), calculado
 *      en el servidor: la ruta del lote 285 (`products/stock-bajo`) se amplia a `products/resumen`, que
 *      devuelve el stock bajo y el valor en una peticion.
 *   2. `TablaCuentas` decia "Excel" y baja un .csv: dice "CSV" (criterio del lote 285). Y un barrido de
 *      `src` para que no quede ningun rotulo Excel/XLS.
 *
 * La regla y la peticion de la pantalla se EJECUTAN (la peticion contra un `fetch` sustituido).
 *
 * Contraprueba contra 07ff28f: 100 % FALLA.
 *
 * Se ejecuta con: npx tsx scratch/verificar_valor_de_inventario.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { pathToFileURL } from 'url';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => (existsSync(resolve(raiz, r)) ? readFileSync(resolve(raiz, r), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');

let fallos = 0;
let comprobaciones = 0;
const ok = (t: string, c: boolean, d = '') => {
  comprobaciones++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const intenta = async (t: string, f: () => boolean | [boolean, string] | Promise<boolean | [boolean, string]>) => {
  try { const r = await f(); if (Array.isArray(r)) ok(t, r[0], r[1]); else ok(t, r); }
  catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
};
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;
const cargar = async (ruta: string): Promise<AnyRec | null> => {
  if (!existsSync(resolve(raiz, ruta))) return null;
  try {
    const m = (await import(pathToFileURL(resolve(raiz, ruta)).href)) as AnyRec;
    return m.default && typeof m.default === 'object' && Object.keys(m).length <= 2 ? { ...m.default, ...m } : m;
  } catch (e) { console.log(`        (no carga ${ruta}: ${(e as Error).message.split('\n')[0]})`); return null; }
};
function ficheros(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficheros(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco no llego al final'); process.exitCode = 1; } });

async function main() {
  // Precondiciones: valen en los dos estados.
  const pagina = leer('src/app/dashboard/products/page.tsx');
  if (!pagina.includes('Valor de Inventario') || !pagina.includes('Stock Bajo')) throw new Error('Precondicion: no estan las tarjetas de Productos');
  if (!leer('src/components/financial/TablaCuentas.tsx').includes('handleExportCSV')) throw new Error('Precondicion: TablaCuentas no exporta CSV');

  // ─── 1. La regla ───────────────────────────────────────────────────────────
  console.log('\n1) La regla: existencia x costo promedio, catalogo entero\n');
  const V = await cargar('src/services/inventario/valorDeInventario.ts');
  const valor = V?.valorDelInventario as ((n: AnyRec[]) => AnyRec) | undefined;
  const corre = (n: AnyRec[]) => { if (!valor) throw new Error('no existe valorDelInventario'); return valor(n); };

  await intenta('un producto en dos almacenes suma los dos: 10 x 100 + 5 x 50,50 = 1.252,50', () => {
    const r = corre([
      { productId: 'a', quantity: '10.0000', averageCost: '100.0000' },
      { productId: 'a', quantity: '5.0000', averageCost: '50.5000' },
    ]);
    return [r.valor === 1252.5 && r.niveles === 2, JSON.stringify(r)];
  });
  await intenta('usa el costo PROMEDIO, no el de catalogo (un `cost` al lado no cuenta)', () => {
    const r = corre([{ productId: 'a', quantity: 2, averageCost: 30, cost: 999 }]);
    return [r.valor === 60, JSON.stringify(r)];
  });
  await intenta('existencia 0 no suma ni cuenta como nivel', () => {
    const r = corre([{ productId: 'a', quantity: '0.0000', averageCost: '80.0000' }, { productId: 'b', quantity: 1, averageCost: 7 }]);
    return [r.valor === 7 && r.niveles === 1, JSON.stringify(r)];
  });
  await intenta('existencia NEGATIVA no resta: se cuenta aparte', () => {
    const r = corre([{ productId: 'a', quantity: '-4.0000', averageCost: '100.0000' }, { productId: 'b', quantity: 3, averageCost: 10 }]);
    return [r.valor === 30 && r.negativos === 1 && r.niveles === 1, JSON.stringify(r)];
  });
  await intenta('un servicio (sin inventario) no cuenta', () => {
    const r = corre([{ productId: 's', quantity: 5, averageCost: 100, tracksInventory: false }, { productId: 'b', quantity: 1, averageCost: 1, tracksInventory: true }]);
    return [r.valor === 1 && r.niveles === 1, JSON.stringify(r)];
  });
  await intenta('un producto borrado no cuenta', () => {
    const r = corre([{ productId: 'x', quantity: 5, averageCost: 100, deletedAt: new Date('2026-09-01') }, { productId: 'b', quantity: 1, averageCost: 2 }]);
    return [r.valor === 2 && r.niveles === 1, JSON.stringify(r)];
  });
  await intenta('existencia con promedio 0 vale 0 y se cuenta (`sinCosto`)', () => {
    const r = corre([{ productId: 'a', quantity: 8, averageCost: '0.0000' }, { productId: 'b', quantity: 1, averageCost: 5 }]);
    return [r.valor === 5 && r.sinCosto === 1 && r.niveles === 2, JSON.stringify(r)];
  });
  await intenta('redondea a centavos al final: 3 x 33,3333 + 0,1 x 3 niveles = 100,30', () => {
    const r = corre([
      { productId: 'a', quantity: '3.0000', averageCost: '33.3333' },
      { productId: 'b', quantity: 1, averageCost: 0.1 },
      { productId: 'c', quantity: 1, averageCost: 0.1 },
      { productId: 'd', quantity: 1, averageCost: 0.1 },
    ]);
    return [r.valor === 100.3, JSON.stringify(r)];
  });
  await intenta('sin niveles: 0, y un texto que no es numero cuenta como 0', () => {
    const vacio = corre([]);
    const raro = corre([{ productId: 'a', quantity: 'abc', averageCost: 5 }]);
    return [vacio.valor === 0 && vacio.niveles === 0 && raro.valor === 0 && raro.niveles === 0, JSON.stringify([vacio, raro])];
  });

  // ─── 2. La ruta ────────────────────────────────────────────────────────────
  console.log('\n2) La ruta: una sola, el resumen del catalogo\n');
  const ruta = sinComentarios(leer('src/app/api/v1/products/resumen/route.ts'));
  ok('`products/resumen` importa y llama las dos reglas (stock bajo y valor) sobre los mismos niveles',
    /import \{ valorDelInventario \} from '@\/services\/inventario\/valorDeInventario';/.test(ruta)
    && /import \{ contarProductosConStockBajo \} from '@\/services\/inventario\/existencia';/.test(ruta)
    && /valorDelInventario\(niveles\)/.test(ruta) && /contarProductosConStockBajo\(niveles\)/.test(ruta)
    && /averageCost: inventoryLevels\.averageCost/.test(ruta) && !/\bproducts\.cost\b/.test(ruta) && !/\*/.test(ruta));
  ok('  acotada por empresa Y modo, sin borrados ni servicios, con permiso de catalogo',
    /eq\(inventoryLevels\.companyId, auth\.companyId\)/.test(ruta) && /eq\(inventoryLevels\.modo, auth\.modo\)/.test(ruta)
    && /eq\(products\.companyId, auth\.companyId\)/.test(ruta) && /isNull\(products\.deletedAt\)/.test(ruta)
    && /eq\(products\.tracksInventory, true\)/.test(ruta)
    && /enforcePermission\(auth\.userId, auth\.role, auth\.roleId, auth\.companyId, 'catalogo', 'read'\)/.test(ruta));
  ok('  y devuelve stockBajo y valorInventario',
    /stockBajo: contarProductosConStockBajo\(niveles\)/.test(ruta) && /valorInventario: valor\.valor/.test(ruta));
  {
    //  La ruta del 285 se AMPLIO, no se duplico: el fichero viejo no esta y nadie la nombra.
    const quienNombra = ficheros(resolve(raiz, 'src')).filter((f) => sinComentarios(readFileSync(f, 'utf8')).includes('products/stock-bajo'));
    ok('la ruta `products/stock-bajo` ya no existe y nada en src la pide',
      !!ruta && !existsSync(resolve(raiz, 'src/app/api/v1/products/stock-bajo/route.ts')) && quienNombra.length === 0,
      quienNombra.map((f) => f.slice(raiz.length + 1)).join(', '));
  }

  // ─── 3. La pantalla ────────────────────────────────────────────────────────
  console.log('\n3) La pantalla: una peticion, y "—" si falla\n');
  const R = await cargar('src/app/dashboard/products/resumenDelCatalogo.ts');
  const pedir = R?.pedirResumenDelCatalogo as ((f: typeof fetch) => Promise<AnyRec | null>) | undefined;
  const pedidas: string[] = [];
  const falso = (estado: number, cuerpo: unknown, lanza = false) => (async (url: unknown) => {
    pedidas.push(String(url));
    if (lanza) throw new TypeError('Failed to fetch');
    return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado });
  }) as typeof fetch;
  const usa = async (f: typeof fetch) => { if (!pedir) throw new Error('no existe pedirResumenDelCatalogo'); return pedir(f); };

  await intenta('con respuesta buena trae las dos cifras, pidiendo UNA vez a `/api/v1/products/resumen`', async () => {
    pedidas.length = 0;
    const r = await usa(falso(200, { success: true, data: { stockBajo: 3, valorInventario: 224040.09, nivelesSinCosto: 7 } }));
    return [!!r && r.stockBajo === 3 && r.valorInventario === 224040.09 && r.nivelesSinCosto === 7
      && pedidas.length === 1 && pedidas[0] === '/api/v1/products/resumen', `${JSON.stringify(r)} ${pedidas.join(',')}`];
  });
  await intenta('un 500 (aunque traiga cifras), un 403, un 2xx sin success y una red caida dan null, no 0', async () => {
    const a = await usa(falso(500, { success: true, data: { stockBajo: 0, valorInventario: 0 } }));
    const b = await usa(falso(403, { success: false, error: { message: 'sin permiso' } }));
    const c = await usa(falso(200, { success: false }));
    const d = await usa(falso(0, null, true));
    const e = await usa(falso(502, '<html>error</html>'));
    return [a === null && b === null && c === null && d === null && e === null, JSON.stringify([a, b, c, d, e])];
  });
  await intenta('un 2xx al que le falta el valor tampoco se pinta como 0', async () => {
    const r = await usa(falso(200, { success: true, data: { stockBajo: 2 } }));
    return [r === null, JSON.stringify(r)];
  });

  const prod = sinComentarios(pagina);
  const tarjeta = (() => { const i = prod.indexOf('>Valor de Inventario'); return i < 0 ? '' : prod.slice(i, prod.indexOf('</div>', i)); })();
  ok('la tarjeta dice "a costo promedio" y pinta el valor del resumen, "—" si no lo hay',
    /Valor de Inventario \(a costo promedio\)/.test(tarjeta)
    && /\{resumen \? formatCurrency\(resumen\.valorInventario\) : '—'\}/.test(tarjeta), tarjeta.replace(/\s+/g, ' ').slice(0, 200));
  ok('  y ya no suma `cost` de la pagina visible',
    !/products\.reduce\([^)]*\bp\.cost\b/.test(prod) && !/\btotalValue\b/.test(prod) && /\bresumen\b/.test(prod));
  ok('la pagina hace UNA peticion (pedirResumenDelCatalogo) en los cuatro momentos de antes',
    /import \{[^}]*\bpedirResumenDelCatalogo\b[^}]*\} from '\.\/resumenDelCatalogo';/.test(prod)
    && /setResumen\(await pedirResumenDelCatalogo\(\)\)/.test(prod)
    && (prod.match(/\bfetchResumen\(\);/g) ?? []).length === 4 && !/\bfetchStockBajo\b/.test(prod));

  // ─── 4. CSV ────────────────────────────────────────────────────────────────
  console.log('\n4) Los botones dicen el formato que bajan\n');
  const tabla = sinComentarios(leer('src/components/financial/TablaCuentas.tsx'));
  ok('TablaCuentas: el boton de exportar dice "CSV"',
    /onClick=\{handleExportCSV\}[^>]*>\s*<Download [^>]*\/>\s*CSV\s*<\/Button>/.test(tabla), (tabla.match(/onClick=\{handleExportCSV\}[\s\S]{0,140}/) ?? [''])[0].replace(/\s+/g, ' '));
  {
    //  Barrido: ningun texto visible, `title` ni `aria-label` de una pantalla dice Excel o XLS. Lo unico
    //  que este proyecto genera en .xlsx es del servidor (`excelGenerator`, `documents/.../download`),
    //  sin boton con ese rotulo; si algun dia una pantalla baja un .xlsx de verdad, se anota aqui.
    const malos: string[] = [];
    for (const f of ficheros(resolve(raiz, 'src')).filter((x) => x.endsWith('.tsx'))) {
      const rel = f.slice(raiz.length + 1).replace(/\\/g, '/');
      const s = sinComentarios(readFileSync(f, 'utf8'));
      const rotulos = [
        ...[...s.matchAll(/>([^<>{}]*)</g)].map((m) => m[1]),
        ...[...s.matchAll(/\b(?:title|aria-label)=["']([^"']*)["']/g)].map((m) => m[1]),
      ];
      for (const r of rotulos) if (/\b(excel|xlsx?)\b/i.test(r)) malos.push(`${rel}: ${r.trim()}`);
    }
    ok('barrido de src: ninguna pantalla rotula Excel ni XLS', malos.length === 0 && /\bCSV\b/.test(tabla), malos.join(' | '));
  }
  invariante('lo que baja TablaCuentas sigue siendo un CSV (text/csv)', /type: 'text\/csv;charset=utf-8;'/.test(tabla));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`} (${comprobaciones} comprobaciones)\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { terminado = true; console.error(e); process.exit(1); });
