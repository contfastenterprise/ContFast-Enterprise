/**
 * Lote 256 -- la tabla de "Precios en dolares" se pagina. Pedido del dueño (2026-10-03): "en la
 * seccion de precios en dolares, la tabla debe tener paginacion".
 *
 * Se pagina en el NAVEGADOR, a proposito: la lista ya llega entera y la necesitan entera "marcar
 * todos" y "Aplicar precios", que valen para todas las paginas y no solo la que se ve. La regla
 * (`trozoDePagina`, pura) acota la pagina: si la lista encoge, se ve la ultima que existe y no una
 * vacia. La barra es el componente compartido (`components/ui/pagination.tsx`), como en el resto.
 *
 * El banco EJECUTA la regla y DIBUJA la tabla.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  //  Vale en los dos estados: la tabla del lote 247.
  if (!leer('src/app/dashboard/products/components/TablaDePreciosEnDolares.tsx')) throw new Error('Precondicion: no existe la tabla de precios en dolares (lote 247)');

  console.log('\n1) La regla, ejecutada\n');
  const r = (await import('../src/services/precios/preciosEnDolares')) as AnyRec;
  const E1 = ['15 por pagina, y la ultima con lo que sobra', 'una pagina fuera de rango se acota (la lista encogio)', 'una lista vacia es una pagina'];
  if (typeof r.trozoDePagina !== 'function') falta(E1, 'no existe trozoDePagina');
  else {
    const lista = Array.from({ length: 32 }, (_, i) => i + 1);
    const p1 = r.trozoDePagina(lista, 1), p3 = r.trozoDePagina(lista, 3);
    ok(E1[0], r.PRODUCTOS_POR_PAGINA === 15 && p1.visibles.length === 15 && p1.visibles[0] === 1 && p1.paginas === 3 && p3.visibles.join() === '31,32',
      `${p1.visibles.length} / ${p3.visibles.join()}`);
    const fuera = r.trozoDePagina(lista.slice(0, 16), 3), cero = r.trozoDePagina(lista, 0);
    ok(E1[1], fuera.pagina === 2 && fuera.visibles.join() === '16' && cero.pagina === 1, `${fuera.pagina} ${cero.pagina}`);
    const vacia = r.trozoDePagina([], 4);
    ok(E1[2], vacia.pagina === 1 && vacia.paginas === 1 && vacia.visibles.length === 0);
  }

  console.log('\n2) La tabla, dibujada\n');
  const [React, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);
  const { TablaDePreciosEnDolares } = (await import('../src/app/dashboard/products/components/TablaDePreciosEnDolares')) as AnyRec;
  const renglon = (i: number) => {
    const actual = { cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 };
    return { productId: `p${i}`, sku: `S${i}`, name: `Producto ${String(i).padStart(2, '0')}`, costoUsd: 2, tasaAplicada: null, actual,
      calculo: { antes: actual, despues: { ...actual, cost: 120, price: 156 }, cambia: true, avisos: [] } };
  };
  const nada = () => undefined;
  const dibujar = (n: number, marcados: string[] = []) => renderToStaticMarkup(React.createElement(TablaDePreciosEnDolares, {
    renglones: Array.from({ length: n }, (_, i) => renglon(i + 1)), marcados, puedeAplicar: true, ocupado: false,
    alMarcar: nada, alMarcarTodos: nada, alGuardarCosto: async () => true, alSoltar: nada,
  }));
  const veinte = dibujar(20, Array.from({ length: 20 }, (_, i) => `p${i + 1}`));
  const filas = (veinte.match(/<tr\b/g) ?? []).length - 1;
  ok('con 20 productos se ven 15, y no el 16', filas === 15 && veinte.includes('Producto 15') && !veinte.includes('Producto 16'), `${filas} filas`);
  //  El texto, sin etiquetas: la barra pone cada cifra en su <strong>.
  ok('  y la barra dice cuantos hay en total', veinte.replace(/<[^>]+>/g, '').includes('Mostrando 1 - 15 de 20 productos'));
  invariante('  "marcar todos" sigue mirando TODA la lista (los 20 marcados, aunque se vean 15)',
    (veinte.match(/<input type="checkbox"[^>]*>/g) ?? []).some((t) => t.includes('aria-label="Marcar todos los productos que cambian"') && t.includes('checked=""')));
  const diez = dibujar(10);
  invariante('con una sola pagina no salen los botones de pasar pagina', !/aria-label="[^"]*(siguiente|Siguiente|next)[^"]*"/.test(diez) && (diez.match(/<tr\b/g) ?? []).length - 1 === 10);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
