/**
 * Lote 310: al abrir un producto, el formulario enseña sus precios GUARDADOS.
 *
 * Reportado por el dueño (2026-10-08): *"al facturar o cotizar ... el precio no cuadra, aunque en
 * producto sí está correcto"*. Medido en PRODUCCIÓN (solo lectura, `medir_precios_nivel_310.ts`):
 * 78 de 86 productos con costo tienen guardados precios distintos de la fórmula del lote 265, y 76
 * siguen con el recargo viejo (costo × 1,25 / 1,20 / 1,15 / 1,10). El formulario de Productos los
 * RECALCULABA al abrirse (un efecto sobre `formData.cost`) y enseñaba los de la fórmula nueva; la
 * factura y la cotización cobran los guardados. Canaleta Cajón Roble, costo 700: proveedor 777,78
 * en Productos, 770 al facturar.
 *
 * Lo que se comprueba:
 *  - la regla pura (`preciosDelFormulario.ts`), EJECUTADA: recalcula desde el costo, y al escribir
 *    el costo solo si el autocálculo está puesto;
 *  - el cableado de la página: ningún efecto recalcula al cambiar `formData.cost` (o sea, al abrir),
 *    el campo del costo y el interruptor llaman a la regla;
 *  - el manual.
 *
 * Uso: npx tsx scratch/verificar_precios_guardados_al_abrir.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

let fallos = 0;
let oks = 0;
const ok = (t: string, c: boolean, d?: unknown) => {
  if (c) { oks++; console.log(`  OK    ${t}`); } else { fallos++; console.log(`  FALLA ${t}${d !== undefined ? ` -> ${JSON.stringify(d)}` : ''}`); }
};
const inv = (t: string, c: boolean, d?: unknown) => {
  if (c) console.log(`  inv   ${t}`); else { fallos++; console.log(`  INV   ${t}${d !== undefined ? ` -> ${JSON.stringify(d)}` : ''}`); }
};
const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  console.log('\n1) La regla (ejecutada)\n');
  const E1 = [
    'con costo 700 da los precios de la fórmula: 933.33 / 875.00 / 823.53 / 777.78',
    'sin costo, o con un costo que no es número, deja el formulario como está',
    'al escribir el costo con el autocálculo puesto, los precios lo siguen',
    'al escribir el costo con el autocálculo apagado, los precios guardados se quedan',
  ];
  let R: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/app/dashboard/products/preciosDelFormulario.ts'))) R = await import('../src/app/dashboard/products/preciosDelFormulario');
  const guardado = { name: 'Canaleta', cost: '700', price: '875.00', priceConsumidor: '840.00', priceMayorista: '805.00', priceProveedor: '770.00' };
  if (!R) for (const t of E1) ok(t, false, 'no existe preciosDelFormulario.ts');
  else {
    const n = R.conPreciosDelCosto(guardado);
    ok(E1[0], n.price === '933.33' && n.priceConsumidor === '875.00' && n.priceMayorista === '823.53' && n.priceProveedor === '777.78' && n.name === 'Canaleta', n);
    const vacio = R.conPreciosDelCosto({ ...guardado, cost: '' });
    const malo = R.conPreciosDelCosto({ ...guardado, cost: 'abc' });
    ok(E1[1], vacio.priceProveedor === '770.00' && malo.priceProveedor === '770.00' && R.conPreciosDelCosto(guardado).priceProveedor === '777.78');
    const auto = R.alCambiarElCosto(guardado, '100', true);
    ok(E1[2], auto.cost === '100' && auto.priceProveedor === '111.11' && auto.price === '133.33', auto);
    const manual = R.alCambiarElCosto(guardado, '100', false);
    ok(E1[3], manual.cost === '100' && manual.priceProveedor === '770.00' && manual.price === '875.00', manual);
  }

  console.log('\n2) La página\n');
  const pag = sinComentarios(leer('src/app/dashboard/products/page.tsx'));
  //  Un efecto que dependa de `formData.cost` corre al abrir el producto: es el defecto.
  const efectos = [...pag.matchAll(/useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
  ok('ningún efecto recalcula los precios al cambiar formData.cost (o sea, al abrir un producto)',
    /from '\.\/preciosDelFormulario'/.test(pag) && !efectos.some((d) => /formData\.cost/.test(d)), efectos);
  ok('el campo del costo recalcula con la regla, según el autocálculo',
    /onChange=\{\(e\) => \{ setFormData\(alCambiarElCosto\(formData, e\.target\.value, !manualPricesEnabled\)\);/.test(pag));
  const interruptor = (pag.match(/checked=\{!manualPricesEnabled\}[\s\S]{0,400}/) ?? [''])[0];
  ok('encender el autocálculo recalcula; apagarlo no toca los precios',
    /setManualPricesEnabled\(!e\.target\.checked\)/.test(interruptor) && /if \(e\.target\.checked\) setFormData\(conPreciosDelCosto\(formData\)\)/.test(interruptor));
  //  Invariante: abrir un producto llena el formulario con lo GUARDADO (cierto antes y después; lo
  //  que cambia es que ya no se pisa).
  inv('handleEdit llena los precios con los del producto', /priceProveedor: product\.priceProveedor \|\| product\.price/.test(pag));

  console.log('\n3) El manual\n');
  const man = leer('scripts/generate-manual.js');
  ok('dice que al abrir un producto se ven sus precios guardados, los que se cobran',
    /Al abrir un producto ya guardado se ven <strong>sus precios guardados<\/strong>, que son los que se cobran al facturar y cotizar/.test(man));
  ok('y ya no dice que los precios viejos se conservan hasta editarlos',
    /sus precios guardados/.test(man) && !/Cambiar la fórmula no recalculó los precios ya guardados/.test(man));
  const ver = Number((man.match(/const VERSION = '(\d+\.\d+)';/) ?? [])[1]);
  ok('la versión del manual es la 3.9 o posterior', ver >= 3.9, ver);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} — ${oks} OK\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
