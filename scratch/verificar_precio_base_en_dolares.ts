/**
 * Lote 258 -- el precio BASE de un producto que sigue al dolar, fijado en dolares. Pedido del dueño
 * (2026-10-03): *"el precio en dolares seria solo para el precio base"*.
 *
 * Hasta ahora, al aplicar la tasa, los cuatro precios conservaban su margen sobre el costo nuevo. Con
 * un precio base en dolares, el precio base = precio en dolares x tasa; los otros tres niveles
 * (consumidor, mayorista, proveedor) siguen con su margen, y un producto sin precio en dolares sigue
 * exactamente como antes. El precio se fija en la tabla (lapiz, como el costo) y vacio lo quita.
 *
 * La columna llega con la migracion 0018, y el repositorio mira si existe ANTES de nombrarla: desplegar
 * antes de aplicarla no tumba la pantalla; solo guardar un precio avisa, nombrando la migracion.
 *
 * El banco EJECUTA la regla y DIBUJA la tabla.
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
const intenta = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

async function main() {
  //  Vale en los dos estados: los precios en dolares del lote 247.
  if (!leer('src/services/precios/preciosEnDolares.ts') || !leer('src/app/api/v1/products/dolar/route.ts')) {
    throw new Error('Precondicion: no existen los precios en dolares (lote 247)');
  }

  console.log('\n1) La regla, ejecutada\n');
  const r = (await import('../src/services/precios/preciosEnDolares')) as AnyRec;
  const base = { cost: 100, price: 130, priceConsumidor: 125, priceMayorista: 115, priceProveedor: 110, costoUsd: 2, oferta: null };
  const sin = r.calcular(base, 60);
  const con = r.calcular({ ...base, precioUsd: 3.3333 }, 60);
  invariante('sin precio en dolares, los cuatro precios conservan su margen (como antes)',
    sin.despues.cost === 120 && sin.despues.price === 156 && sin.despues.priceConsumidor === 150 && sin.despues.priceProveedor === 132);
  ok('con precio en dolares, el precio base = precio en dolares x tasa, al centavo',
    con.despues.price === 200, String(con.despues.price));
  invariante('  y los otros tres niveles siguen con su margen sobre el costo',
    con.despues.cost === 120 && con.despues.priceConsumidor === 150 && con.despues.priceMayorista === 138 && con.despues.priceProveedor === 132,
    JSON.stringify(con.despues));
  const soloPrecio = r.calcular({ ...base, costoUsd: 100 / 60, precioUsd: 150 / 60 }, 60);
  ok('  aunque el costo no cambie, un precio en dolares distinto del de hoy es un cambio',
    soloPrecio.cambia === true && soloPrecio.despues.price === 150 && soloPrecio.despues.cost === 100, JSON.stringify(soloPrecio.despues));
  const E2 = ['leerPrecioUsd: vacio es "sin precio en dolares" (null), no un error',
    '  un precio cero, negativo o que no es numero se rechaza, con su motivo', '  y se guarda con cuatro decimales como mucho'];
  if (typeof r.leerPrecioUsd !== 'function') falta(E2, 'no existe leerPrecioUsd');
  else {
    const vacios = ['', '  ', null, undefined].map((v) => intenta(() => r.leerPrecioUsd(v)));
    ok(E2[0], vacios.every((x) => x !== 'LANZO' && x.bien === true && x.valor === null), JSON.stringify(vacios));
    const malos = ['0', '-5', 'abc'].map((v) => intenta(() => r.leerPrecioUsd(v)));
    ok(E2[1], malos.every((x) => x !== 'LANZO' && x.bien === false && /precio en dólares/.test(x.mensaje)), JSON.stringify(malos));
    const bien = intenta(() => r.leerPrecioUsd('45.123456'));
    ok(E2[2], bien !== 'LANZO' && bien.bien === true && bien.valor === 45.1235, JSON.stringify(bien));
  }

  console.log('\n2) La base y el repositorio\n');
  const migracion = leer('drizzle/0018_precio_base_en_dolares.sql');
  ok('la migracion 0018 solo AÑADE la columna (nula) y su freno de positivo',
    /ALTER TABLE "productos_en_dolares" ADD COLUMN "precio_usd" numeric\(15, 4\);/.test(migracion)
    && /CHECK \("precio_usd" IS NULL OR "precio_usd" > 0\)/.test(migracion) && !/DROP|UPDATE|NOT NULL/.test(migracion));
  ok('  y el esquema de Drizzle la declara', /precioUsd: decimal\('precio_usd', \{ precision: 15, scale: 4 \}\),/.test(leer('src/db/schema/dolar.ts')));
  const repo = sinComentarios(leer('src/services/precios/preciosEnDolaresRepositorio.ts'));
  ok('el repositorio mira si la columna existe antes de nombrarla (sin la 0018 la pantalla no se cae)',
    /information_schema\.columns[\s\S]{0,120}column_name = 'precio_usd'/.test(repo)
    //  LOTE 261: al menos dos, no exactamente dos. El 261 añadio una tercera lectura (guardar la
    //  tasa y aplicar) que tambien pasa por `columnasDe`; contar fijaba la FORMA. La propiedad es
    //  que ninguna nombre las columnas sin mirar antes, y eso lo dice el `!/\.select\(columnas\)/`.
    && (repo.match(/\.select\(columnasDe\(conPrecio\)\)/g) ?? []).length >= 2
    && /const conPrecio = await hayPrecioUsd\(\);/.test(repo) && /const conPrecio = await hayPrecioUsd\(tx\);/.test(repo) && !/\.select\(columnas\)/.test(repo)
    && /const columnasDe = \(conPrecio: boolean\) => \(conPrecio \? \{ \.\.\.columnas, precioUsd: productosEnDolares\.precioUsd \} : columnas\)/.test(repo));
  ok('  el renglon lleva el precio y el calculo lo usa',
    /calcular\(\{ \.\.\.actual, costoUsd, precioUsd, oferta/.test(repo) && /const precioUsd = f\.precioUsd \? num\(f\.precioUsd\) : null;/.test(repo));
  const fijar = repo.slice(repo.indexOf('fijarPrecioUsd:'), repo.indexOf('}),', repo.indexOf('fijarPrecioUsd:')));
  ok('fijar el precio sin la 0018 avisa nombrandola; se acota a la empresa y vacio lo quita',
    repo.includes('fijarPrecioUsd:')
    && /if \(!\(await hayPrecioUsd\(\)\)\) throw new FaltaLaMigracionDeDolares\('0018_precio_base_en_dolares\.sql'/.test(fijar)
    && /eq\(productosEnDolares\.companyId, companyId\)/.test(fijar) && /precioUsd === null \? null :/.test(fijar));

  console.log('\n3) La ruta y la pantalla\n');
  const ruta = sinComentarios(leer('src/app/api/v1/products/dolar/route.ts'));
  const patch = ruta.slice(ruta.indexOf('export async function PATCH'), ruta.indexOf('export async function DELETE'));
  ok('PATCH fija el precio: solo administracion y sistemas, leido con leerPrecioUsd, 404 si no sigue al dolar',
    ruta.includes('export async function PATCH') && /if \(!esAdminOSistemas\(auth\.role\)\) return soloAdministracion\(\);/.test(patch)
    && /const precio = leerPrecioUsd\(cuerpo\.precioUsd\);\s*if \(!precio\.bien\) return rechazo\(400/.test(patch)
    && /fijarPrecioUsd\(auth\.companyId, cuerpo\.productId, precio\.valor\)/.test(patch) && /rechazo\(404/.test(patch));
  const hook = sinComentarios(leer('src/app/dashboard/products/hooks/usePreciosEnDolares.ts'));
  ok('el hook lo manda por PATCH y la pantalla se lo pasa a la tabla',
    /json\('PATCH', \{ productId, precioUsd \}\)/.test(hook) && /fijarPrecioUsd, soltar,/.test(hook)
    && /alGuardarPrecio=\{d\.fijarPrecioUsd\}/.test(leer('src/app/dashboard/products/components/PreciosEnDolares.tsx')));

  const [React, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);
  const { TablaDePreciosEnDolares } = (await import('../src/app/dashboard/products/components/TablaDePreciosEnDolares')) as AnyRec;
  const renglon = (id: string, name: string, precioUsd: number | null) => {
    const actual = { cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 };
    return { productId: id, sku: id, name, costoUsd: 2, precioUsd, tasaAplicada: null, actual,
      calculo: { antes: actual, despues: { ...actual, cost: 120, price: 156 }, cambia: true, avisos: [] } };
  };
  const nada = () => undefined;
  const html = renderToStaticMarkup(React.createElement(TablaDePreciosEnDolares, {
    renglones: [renglon('a', 'Puerta Roble', 3.25), renglon('b', 'Dintel Caoba', null)], marcados: [], puedeAplicar: true, ocupado: false,
    alMarcar: nada, alMarcarTodos: nada, alGuardarCosto: async () => true, alGuardarPrecio: async () => true, alSoltar: nada,
  }));
  const fila = (n: string) => { const i = html.indexOf(n); return html.slice(i, html.indexOf('</tr>', i)); };
  ok('la tabla enseña el precio en dolares de cada producto, y una raya si no tiene',
    /Precio<\/span><span[^>]*>US\$ 3\.25<\/span>/.test(fila('Puerta Roble')) && /Precio<\/span><span class="text-slate-400">—<\/span>/.test(fila('Dintel Caoba')),
    fila('Dintel Caoba').slice(0, 600));
  ok('  y se cambia con su lapiz, que dice de que producto es',
    html.includes('aria-label="Cambiar el precio base en dólares de Puerta Roble"') && html.includes('aria-label="Cambiar el costo en dólares de Dintel Caoba"'));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
