/**
 * Lote 257 -- en las compras, los productos que siguen al dolar entran con su costo en dolares por
 * la tasa vigente. Pedido del dueño (2026-10-03): *"para las compras, los productos que tienen
 * precios en dolares deben calcularse en base a la tasa establecida"*.
 *
 * Antes la linea tomaba el costo de CATALOGO, que solo se pone al dia al pulsar "Aplicar precios": con
 * la tasa escrita y los precios sin aplicar, la compra entraba con el costo de la tasa vieja. Ahora
 * `costoParaCompra` (pura) decide: dolares x tasa si el producto sigue al dolar y hay tasa; si no, el
 * de catalogo de siempre. Las CINCO puertas por las que un producto entra a una compra (escanear,
 * reorden, autocompletado, desplegable) pasan por ella, y la linea dice de donde sale el costo.
 * El costo se puede seguir cambiando a mano.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const pagina = sinComentarios(leer('src/app/dashboard/purchases/page.tsx'));
  //  Vale en los dos estados: la compra elige productos y los escanea.
  if (!/const applyProductToLine = /.test(pagina) || !/useBarcodeScanner/.test(pagina)) throw new Error('Precondicion: la pantalla de compras no es la de siempre');

  console.log('\n1) La regla, ejecutada\n');
  const r = (await import('../src/services/precios/preciosEnDolares')) as AnyRec;
  const E1 = ['un producto en dolares entra con costo en dolares x tasa vigente, redondeado al centavo',
    'sin tasa escrita, o si no sigue al dolar, el costo de catalogo de siempre', 'un costo de catalogo que no es un numero es 0'];
  if (typeof r.costoParaCompra !== 'function') falta(E1, 'no existe costoParaCompra');
  else {
    ok(E1[0], r.costoParaCompra('2657.20', 45, 63.5) === 2857.5 && r.costoParaCompra('1', 3.3333, 63.5) === 211.66, String(r.costoParaCompra('2657.20', 45, 63.5)));
    ok(E1[1], r.costoParaCompra('2657.20', 45, null) === 2657.2 && r.costoParaCompra('600', undefined, 63.5) === 600 && r.costoParaCompra('600', 0, 63.5) === 600);
    ok(E1[2], r.costoParaCompra(undefined, null, null) === 0 && r.costoParaCompra('abc', null, null) === 0);
  }

  console.log('\n2) La pantalla de compras\n');
  ok('las cinco puertas por las que entra un producto pasan por costoDe, y ninguna lee el costo de catalogo a pelo',
    (pagina.match(/costoDe\((product|prod)\)/g) ?? []).length === 6 && !/(parseFloat|Number)\((product|prod)\.cost/.test(pagina));
  ok('  el costo de cada linea dice de donde sale (US$ x tasa)',
    /const o = l\.productId \? origenDe\(l\.productId\) : null;[\s\S]{0,200}US\$ \{escribirTasa\(o\.costoUsd\)\} × \{escribirTasa\(o\.tasa\)\}/.test(pagina));
  invariante('  y se puede seguir cambiando a mano', /value=\{l\.unitCost \|\| ''\} onChange=\{e => updateLine\(l\.id, 'unitCost'/.test(pagina));
  const hook = sinComentarios(leer('src/app/dashboard/purchases/hooks/useCostoEnDolares.ts'));
  ok('el hook lee la tasa y los productos en dolares UNA vez, mirando el estado antes del cuerpo',
    /leerRespuesta<[^>]+>\(await fetch\('\/api\/v1\/products\/dolar'\)\)/.test(hook) && /useEffect\(\(\) => \{ cargar\(\); \}, \[cargar\]\);/.test(hook));
  ok('  si no puede (sin permiso, sin red), no frena la compra: se queda el costo de catalogo',
    /if \(!leido\.bien\) return;/.test(hook) && /catch \{/.test(hook) && /costoParaCompra\(prod\.cost, costosUsd\.get\(prod\.id\), tasa\)/.test(hook));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
