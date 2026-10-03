/**
 * Lote 251 -- atar VARIOS productos al dolar de una vez, con el mismo costo.
 * Pedido del dueño (2026-10-02): "que se puedan seleccionar varios productos, ya
 * que puede haber productos con el mismo precio".
 *
 * Ejecuta la seleccion (`services/precios/seleccionDeProductos.ts`, pura) y lo
 * que el hook manda al servidor; mira que la pantalla use esas reglas y que la
 * ruta acepte la lista. Que el servidor ata todos o ninguno lo comprueba
 * `verificar_varios_al_dolar_db.ts`. La pantalla se miro en el navegador.
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
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

async function main() {
  //  Vale en los dos estados: la pantalla de precios en dolares del lote 247.
  if (!leer('src/app/dashboard/products/components/AtarProductoAlDolar.tsx')) throw new Error('Precondicion: no existe el alta de productos en dolares (lote 247)');

  console.log('\n1) La seleccion, ejecutada\n');
  let s: AnyRec | null = null;
  try { s = (await import('../src/services/precios/seleccionDeProductos')) as AnyRec; } catch { s = null; }
  const E1 = ['marcar y desmarcar el mismo producto', 'lo marcado conserva el orden en que se marco',
    '"Marcar los N" anade solo los que faltan, sin repetir', 'lo marcado sobrevive a otra busqueda'];
  if (!s) falta(E1, 'no existe services/precios/seleccionDeProductos.ts');
  else {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
    const uno = s.alternar([], a);
    ok(E1[0], uno.length === 1 && s.alternar(uno, a).length === 0, JSON.stringify(uno));
    ok(E1[1], s.alternar(s.alternar([], b), a).map((x: AnyRec) => x.id).join() === 'b,a');
    const todos = s.marcarTodos([b], [a, b, c]);
    ok(E1[2], todos.map((x: AnyRec) => x.id).join() === 'b,a,c' && s.sinMarcar([b], [a, b, c]).length === 2, todos.map((x: AnyRec) => x.id).join());
    ok(E1[3], s.marcarTodos(s.alternar([], a), [b, c]).map((x: AnyRec) => x.id).join() === 'a,b,c');
  }

  console.log('\n2) Lo que se manda al servidor, ejecutado\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner');
  const avisos: string[] = [];
  (toast as AnyRec).error = (m: string) => { avisos.push(`error:${m}`); return 0; };
  (toast as AnyRec).success = (m: string) => { avisos.push(`bien:${m}`); return 0; };
  let pedidos: { metodo: string; cuerpo: AnyRec | null }[] = [];
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    pedidos.push({ metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
    return json(200, { success: true, data: { tasa: null, historial: [], renglones: [], hoy: '2026-10-02', puedeAplicar: true } });
  }) as typeof fetch;
  let usar: (() => AnyRec) | null = null;
  try { usar = ((await import('../src/app/dashboard/products/hooks/usePreciosEnDolares')) as AnyRec).usePreciosEnDolares ?? null; } catch { usar = null; }
  const E2 = ['anadir varios manda UNA peticion con todos los productos y el mismo costo', '  y el aviso dice cuantos se anadieron',
    'cambiar el costo de un producto de la tabla sigue mandando ese solo'];
  const h: AnyRec = {};
  if (usar) renderToStaticMarkup(React.createElement(() => { Object.assign(h, usar!()); return null; }));
  if (!usar || typeof h.atarVarios !== 'function') falta(E2, 'el hook no tiene atarVarios');
  else {
    pedidos = []; avisos.length = 0;
    await h.atarVarios(['p1', 'p2', 'p3'], '12.50');
    const put = pedidos.filter((p) => p.metodo === 'PUT');
    ok(E2[0], put.length === 1 && JSON.stringify(put[0].cuerpo) === JSON.stringify({ productIds: ['p1', 'p2', 'p3'], costoUsd: '12.50' }), JSON.stringify(put));
    ok(E2[1], avisos.includes('bien:3 productos añadidos.'), avisos.join(' | '));
    pedidos = [];
    await h.atar('p9', '7');
    const uno = pedidos.filter((p) => p.metodo === 'PUT');
    ok(E2[2], uno.length === 1 && JSON.stringify(uno[0].cuerpo) === JSON.stringify({ productIds: ['p9'], costoUsd: '7' }), JSON.stringify(uno));
  }

  console.log('\n3) La pantalla y la ruta\n');
  const comp = sinComentarios(leer('src/app/dashboard/products/components/AtarProductoAlDolar.tsx'));
  const cont = sinComentarios(leer('src/app/dashboard/products/components/PreciosEnDolares.tsx'));
  ok('la pantalla marca con las reglas puras (no con una copia propia)',
    /import \{ alternar, marcarTodos, sinMarcar \} from '@\/services\/precios\/seleccionDeProductos';/.test(comp)
    && /setElegidos\(\(prev\) => alternar\(prev, p\)\)/.test(comp) && /setElegidos\(\(prev\) => marcarTodos\(prev, encontrados\)\)/.test(comp));
  ok('  cada producto de la busqueda es una casilla que dice si esta marcada', /role="checkbox" aria-checked=\{marcado\}/.test(comp));
  ok('  y el boton dice cuantos se anaden', /`Añadir \$\{elegidos\.length\} productos`/.test(comp));
  ok('  el alta usa atarVarios; corregir el costo en la tabla sigue usando atar',
    /alAtar=\{d\.atarVarios\}/.test(cont) && /alGuardarCosto=\{d\.atar\}/.test(cont));
  const ruta = sinComentarios(leer('src/app/api/v1/products/dolar/route.ts'));
  const put = ruta.slice(ruta.indexOf('export async function PUT('), ruta.indexOf('export async function DELETE('));
  ok('la ruta acepta la lista (y `productId` suelto sigue valiendo), con tope',
    /Array\.isArray\(cuerpo\?\.productIds\) \? cuerpo\.productIds : \[cuerpo\?\.productId\]/.test(put)
    && /ids\.length > MAXIMO_A_LA_VEZ/.test(put) && /ids\.every\(esUuid\)/.test(put));
  const repo = sinComentarios(leer('src/services/precios/preciosEnDolaresRepositorio.ts'));
  ok('  el repositorio ata todos o ninguno, en una transaccion',
    /atar: \(companyId: string, productIds: string\[\], costoUsd: number\)/.test(repo) && /if \(propios\.length !== unicos\.length\) return false;/.test(repo));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); terminado = true; process.exit(2); });
