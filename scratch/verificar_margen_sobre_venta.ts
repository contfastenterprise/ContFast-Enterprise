/**
 * Lote 265 -- el porcentaje de ganancia es un margen sobre el PRECIO DE VENTA.
 *
 * Decision del dueño (2026-10-03): *"usa la formula costo / 0,75 = 133,33. aplicalo en todos los
 * lugares (productos y facturacion)"*. Antes: recargo sobre el costo (`costo x 1,25` = 125, un 20 %
 * de lo vendido). Ahora `costo / (1 - margen)`, con los mismos porcentajes (25, 20, 15, 10).
 *
 * La factura no calcula precios desde el costo: cobra los del catalogo. Asi que "en todos los
 * lugares" son los dos que los calculan: el formulario de productos y "Precios en dolares" (cuando
 * un producto no tenia costo). Los dos pasan por `services/precios/margen.ts`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_margen_sobre_venta.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const productos = sinComentarios(leer('src/app/dashboard/products/page.tsx'));
  const dolares = sinComentarios(leer('src/services/precios/preciosEnDolares.ts'));
  if (!productos || !dolares) throw new Error('Precondicion: faltan el formulario de productos o preciosEnDolares');
  const D = (await import('../src/services/precios/preciosEnDolares')) as AnyRec;

  console.log('\n1) La regla, ejecutada\n');
  const E = [
    'costo 100 con 25 %: 100 / 0,75 = 133,33 (la formula del dueño)',
    '  y la ganancia es el 25 % del PRECIO, no del costo',
    'los cuatro niveles de fabrica: 133,33 / 125 / 117,65 / 111,11',
    'sin costo, o con un margen imposible (100 % o mas), no inventa precio',
  ];
  let M: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/services/precios/margen.ts'))) M = await import('../src/services/precios/margen');
  if (!M) for (const t of E) ok(t, false, 'no existe services/precios/margen.ts');
  else {
    const m = M;
    intenta(E[0], () => m.precioConMargen(100, 0.25) === 133.33);
    intenta(E[1], () => { const p = m.precioConMargen(1000, 0.25); return Math.abs((p - 1000) / p - 0.25) < 0.0001; });
    intenta(E[2], () => JSON.stringify(m.preciosDesdeCosto(100)) === JSON.stringify({ price: 133.33, priceConsumidor: 125, priceMayorista: 117.65, priceProveedor: 111.11 }));
    intenta(E[3], () => m.precioConMargen(0, 0.25) === 0 && m.precioConMargen(100, 1) === 0 && m.precioConMargen(-5, 0.2) === 0);
  }

  console.log('\n2) Los dos sitios que calculan precios desde el costo\n');
  intenta('"Precios en dolares": un producto sin costo sale con los margenes sobre la venta', () => {
    const c = D.calcular({ costoUsd: 2, cost: 0, price: 0, priceConsumidor: 0, priceMayorista: 0, priceProveedor: 0 }, 50);
    return c.despues.cost === 100 && c.despues.price === 133.33 && c.despues.priceConsumidor === 125
      && c.despues.priceMayorista === 117.65 && c.despues.priceProveedor === 111.11;
  });
  ok('  con la regla de `margen.ts`, no factores escritos a mano',
    /import \{[^}]*\bprecioConMargen\b[^}]*\} from '\.\/margen'/.test(dolares) && /precioConMargen\(cost, MARGENES_SOBRE_VENTA\[clave\]\)/.test(dolares)
    && !/\b1\.25\b|\b1\.15\b/.test(dolares));
  ok('el formulario de productos calcula con la misma regla',
    /import \{ preciosDesdeCosto \} from '@\/services\/precios\/margen'/.test(productos) && /preciosDesdeCosto\(costNum\)/.test(productos)
    && !/costNum \* 1\.\d+/.test(productos));
  ok('  y las etiquetas dicen "margen", no "+25%"',
    ['P. Base (margen 25%)', 'P. Consumidor (margen 20%)', 'P. Mayorista (margen 15%)', 'P. Proveedor (margen 10%)'].every((t) => productos.includes(t))
    && !/\(\+\d+%\)/.test(productos));

  console.log('\n3) Lo que no cambia (invariantes)\n');
  const conCosto = D.calcular({ costoUsd: 2, cost: 100, price: 133.33, priceConsumidor: 125, priceMayorista: 0, priceProveedor: 111.11 }, 60);
  invariante('con costo anterior, cada precio conserva SU margen al cambiar la tasa (proporcion)',
    conCosto.despues.cost === 120 && conCosto.despues.price === 160 && conCosto.despues.priceConsumidor === 150 && conCosto.despues.priceMayorista === 0,
    JSON.stringify(conCosto.despues));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
