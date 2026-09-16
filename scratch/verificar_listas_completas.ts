/**
 * Banco del lote 135: desplegables que traian menos de lo que creian -- o nada
 * -- y el trinquete que caza al siguiente.
 *
 *     pnpm exec tsx scratch/verificar_listas_completas.ts
 *
 * VIENE DEL LOTE 132 (`limit` contra `per_page` en codigos de barras) y del
 * 134 (el 606). La forma del fallo es siempre la misma: **un parametro que la
 * ruta no lee no da error, se ignora**, y lo que vuelve es la primera pagina.
 * Cuando eso alimenta un desplegable, la opcion que falta no deja hueco donde
 * mirar.
 *
 * LO QUE SE ENCONTRO, medido el 2026-09-15 contra la base (solo lectura):
 *
 * - MOVIMIENTOS DE INVENTARIO: el filtro de productos salia SIEMPRE VACIO. Dos
 *   motivos a la vez: `?limit=1000` (nadie lo lee; la ruta lee `per_page`,
 *   defecto 20) y `prRes.data.items`, que no existe -- la respuesta es
 *   `{ data: [...] }`. 87 productos en el catalogo, 0 opciones. Nadie podia
 *   filtrar movimientos por producto.
 *
 * - COMPRAS, desde una sugerencia de reorden: pedia una PAGINA de productos y
 *   buscaba dentro el que se viene a reponer. Sin decir cuantos queria,
 *   llegaban 20; 67 de los 87 no estaban ahi. Para esos, la compra se abria
 *   vacia y sin aviso (el `if (prod)` no tenia `else`).
 *
 * - BI: `per_page=100` a dos rutas que paginan con `limit`; se llevaban 50. Con
 *   14 clientes y 14 suplidores todavia no muerde, pero el numero escrito ahi
 *   no significaba nada.
 *
 * La seccion C EJECUTA el barrido entero sobre el arbol, no mira un fichero:
 * cruza lo que manda cada llamada del navegador con lo que lee su ruta, y solo
 * tolera los casos anotados abajo.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const MOVS = 'src/app/dashboard/inventory/movements/page.tsx';
const COMPRAS = 'src/app/dashboard/purchases/page.tsx';
const BI = 'src/app/dashboard/bi/page.tsx';
const AJUSTE = 'src/app/dashboard/inventory/adjustments/page.tsx';
const API_PROD = 'src/app/api/v1/products/route.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const api = codigo(API_PROD);
  //  Los dos hechos que hacian malas las llamadas viejas.
  exige(!/searchParams\.get\(['"]limit['"]\)/.test(api),
        'la ruta de productos ahora SI lee `limit`: medio lote sobraria');
  exige(/const perPage = parseInt\(searchParams\.get\('per_page'\) \|\| '20', 10\);/.test(api),
        'la ruta de productos ya no pagina con per_page/20');
  //  La respuesta es `{ data: [...] }`, no `{ data: { items } }`.
  exige(api.includes('const responseDataList = { success: true, data: dataWithInventory, meta: result.meta };'),
        'la ruta de productos ya no responde { data, meta }');
  //  Y existe la ruta de UN producto, que es a la que va la compra ahora.
  exige(fs.existsSync('src/app/api/v1/products/[id]/route.ts'),
        'ya no existe la ruta de un solo producto');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL FILTRO DE MOVIMIENTOS SE LLENA');
// ─────────────────────────────────────────────────────────────────────────
{
  const carga = bloque(codigo(MOVS), 'const loadDependencies = async () => {');
  ok('pide los productos con el parametro que la ruta lee',
     /fetch\('\/api\/v1\/products\?per_page=1000'\)/.test(carga) && !/limit=1000/.test(carga));
  ok('y los saca de donde vienen, no de un `items` que no existe',
     /setProducts\(prRes\.data \|\| \[\]\);/.test(carga) && !/prRes\.data\.items/.test(carga));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LA COMPRA POR REORDEN PIDE EL PRODUCTO QUE ES');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(COMPRAS);
  ok('pide ese producto, no una pagina donde buscarlo',
     /fetch\(`\/api\/v1\/products\/\$\{reorderProductId\}`\)/.test(src)
     && !/data\.data\.find\(\(p: any\) => p\.id === reorderProductId\)/.test(src));
  //  Contar cuantas veces aparece el mensaje no sirve: un `else if (false)` lo
  //  deja presente y muerto. Se mira la ESTRUCTURA -- que sea el `else` del
  //  `if (prod)`, sin condicion, y que lo primero que haya dentro sea el
  //  aviso -- y que el `catch` avise tambien.
  ok('y si no se puede leer, lo dice en vez de abrir la compra vacia',
     /\} else \{\s*toast\.error\('No se pudo cargar el producto de la sugerencia de reorden/.test(src)
     && /\.catch\(\(\) => toast\.error\('No se pudo cargar el producto de la sugerencia de reorden/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('C. TRINQUETE: NADIE MANDA UN PARAMETRO QUE SU RUTA NO LEE');
// ─────────────────────────────────────────────────────────────────────────
//  Lo tolerado, con su motivo. Cualquier otro caso hace fallar el banco.
const TOLERADOS = [
  //  `t=${Date.now()}` es un rompecaches deliberado para el navegador; la ruta
  //  no tiene por que leerlo.
  { url: '/api/v1/products', param: 't' },
  //  El barrido lee `/api/v1/supplier-orders/${o.id}/receive` como si
  //  `.id}/receive` fuera un parametro. Es un trozo de la ruta, no un
  //  parametro.
  { url: '/api/v1/supplier-orders/[id]', param: '.id}/receive' },
];

function ficheros(dir: string, fin: string[]): string[] {
  const salida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) salida.push(...ficheros(p, fin));
    else if (fin.some((f) => e.name.endsWith(f))) salida.push(p);
  }
  return salida;
}

const rutas = new Map<string, Set<string>>();
for (const f of ficheros('src/app/api', ['route.ts'])) {
  const src = fs.readFileSync(f, 'utf8');
  const leidos = new Set<string>();
  for (const m of src.matchAll(/searchParams\.(?:get|getAll|has)\(\s*['"]([^'"]+)['"]/g)) leidos.add(m[1]);
  const comodin = /fromEntries\(\s*(?:searchParams|url\.searchParams)/.test(src)
    || /searchParams\.(?:entries|forEach)\(/.test(src);
  rutas.set(f.replace(/^src\/app/, '').replace(/\/route\.ts$/, ''), comodin ? new Set(['*']) : leidos);
}
exige(rutas.size > 50, `el barrido no encontro rutas (${rutas.size}): algo cambio de sitio`);

function rutaDe(url: string): string | null {
  if (rutas.has(url)) return url;
  const partes = url.split('/');
  for (const candidata of rutas.keys()) {
    const cp = candidata.split('/');
    if (cp.length === partes.length && cp.every((c, i) => c === partes[i] || /^\[.*\]$/.test(c))) return candidata;
  }
  return null;
}

const sordos: string[] = [];
let conParametros = 0;
for (const f of ficheros('src/app', ['.tsx']).concat(ficheros('src/components', ['.tsx', '.ts']))) {
  if (f.includes('/api/')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const llamadas: { url: string; params: string[] }[] = [];

  for (const m of src.matchAll(/['"`](\/api\/v1\/[^'"`?\s]+)\?([^'"`]*)['"`]/g)) {
    const ps = m[2].split('&').map((t) => t.split('=')[0].trim())
      .filter((t) => t && !t.includes('$') && !t.includes('{'));
    if (ps.length) llamadas.push({ url: m[1], params: ps });
  }
  for (const m of src.matchAll(/new URLSearchParams\(\{([\s\S]{0,600}?)\}\)/g)) {
    const ps = [...m[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gm)].map((x) => x[1]);
    const resto = src.slice(m.index!, m.index! + 3000);
    for (const s of resto.matchAll(/params\.(?:set|append)\(\s*['"]([^'"]+)['"]/g)) ps.push(s[1]);
    const destino = /['"`](\/api\/v1\/[^'"`?\s]+)\?\$\{/.exec(resto);
    if (destino && ps.length) llamadas.push({ url: destino[1], params: [...new Set(ps)] });
  }

  for (const l of llamadas) {
    conParametros++;
    const r = rutaDe(l.url);
    if (!r) continue;
    const lee = rutas.get(r)!;
    if (lee.has('*')) continue;
    for (const p of l.params) {
      if (lee.has(p)) continue;
      if (TOLERADOS.some((t) => t.url === r && t.param === p)) continue;
      sordos.push(`${f}: ${r}?${p}=  (la ruta lee: ${[...lee].join(', ') || 'ninguno'})`);
    }
  }
}
exige(conParametros > 80, `el barrido no encontro llamadas (${conParametros}): algo cambio de sitio`);
ok(`ninguna llamada manda un parametro sordo (${sordos.length} sin tolerar)`, sordos.length === 0);
for (const s of sordos) console.log(`         ${s}`);

//  Y los cuatro sitios de este lote, uno por uno, para que el trinquete no sea
//  lo unico que los vigile.
ok('bi: los dos desplegables piden con `limit`, que es lo que su ruta lee',
   /fetch\('\/api\/v1\/customers\?limit=100'\)/.test(codigo(BI))
   && /fetch\('\/api\/v1\/suppliers\?limit=100'\)/.test(codigo(BI)));
ok('ajuste rapido: el buscador pide con `per_page`',
   /search=\$\{searchQuery\}&per_page=10/.test(codigo(AJUSTE)));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
