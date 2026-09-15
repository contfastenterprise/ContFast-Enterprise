/**
 * Banco del lote 132: los contadores de la pantalla de codigos de barras, y el
 * quinto tramo de P3-45 (codigos de barras, pagos de CxP, productos).
 *
 *     pnpm exec tsx scratch/verificar_contadores_barras.ts
 *
 * EL DEFECTO. La pantalla de codigos de barras pedia `/api/v1/products?limit=100000`
 * y contaba en el navegador lo que llegaba. La API no lee `limit` -- lee
 * `per_page`, con defecto 20 --, asi que ese "todo el catalogo" era la primera
 * pagina de 20 y los tres numeros de arriba eran de esos 20. Medido el
 * 2026-09-15 contra la empresa que opera (`scratch/_to_delete/medir_contadores_barras.ts`,
 * solo lectura): 87 productos y 30 con codigo, mientras la pantalla decia 20 y
 * 2. "Sin Codigo (Pendientes)", que es a lo que se viene a esta pantalla,
 * decia 18 en vez de 57.
 *
 * Es la misma confusion que el lote 110 cerro en cotizaciones (`limit` contra
 * `per_page`), y por eso la precondicion de abajo fija que la API sigue sin
 * leer `limit`: si algun dia lo leyera, este arreglo sobraria.
 *
 * Y de paso el tramo: las tres pantallas pasan al componente comun, con el
 * tamano de pagina en una constante que se usa en lo que se pide y en lo que
 * se enseña.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const BARRAS = 'src/app/dashboard/products/barcodes/page.tsx';
const PAGOS = 'src/app/dashboard/ap/page.tsx';
const PRODUCTOS = 'src/app/dashboard/products/page.tsx';
const API = 'src/app/api/v1/products/route.ts';
const REPO = 'src/repositories/productRepository.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const api = codigo(API);
  //  La razon del defecto: `limit` no se lee, `per_page` si.
  exige(!/searchParams\.get\(['"]limit['"]\)/.test(api),
        'la API de productos ahora SI lee `limit`: el arreglo del lote 132 sobraria');
  exige(api.includes("searchParams.get('per_page')") && api.includes("searchParams.get('has_barcode')"),
        'la API de productos ya no lee per_page o has_barcode');
  //  Y la razon de que el arreglo funcione: el total lo cuenta la base con el
  //  MISMO filtro que la pagina, asi que una pagina de 1 basta para contarlo.
  const repo = codigo(REPO);
  exige(repo.includes('.select({ value: count() })') && repo.includes('.where(searchFilter)'),
        'productRepository.list ya no cuenta con el mismo filtro que la pagina');
  //  (el `meta` lo arma el repositorio, no la ruta)
  exige(/meta: \{[\s\S]{0,200}total,[\s\S]{0,120}total_pages: Math\.ceil\(total \/ perPage\),/.test(repo),
        'productRepository.list ya no devuelve el total en meta');
}
//  El componente comun sigue trayendo lo que estas pantallas le piden.
{
  const p = codigo('src/components/ui/pagination.tsx');
  exige(p.includes('itemLabel = "registros"'), 'el componente ya no trae itemLabel con su valor por defecto');
  exige(p.includes('hideControlsWhenSinglePage'), 'el componente ya no sabe esconderse cuando solo hay una pagina');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LOS CONTADORES CUENTAN EL CATALOGO, NO UNA PAGINA');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(BARRAS);
  ok('ya no pide un `limit` que nadie lee',
     !/limit=100000/.test(src) && !/\?limit=/.test(src));
  ok('pregunta el total con una pagina de UN producto, sin filtro y con codigo',
     /fetch\('\/api\/v1\/products\?per_page=1'\)/.test(src)
     && /fetch\('\/api\/v1\/products\?per_page=1&has_barcode=true'\)/.test(src));
  ok('y lee el total de `meta`, no el largo de lo que llego',
     /const total = statsData\.meta\?\.total \|\| 0;/.test(src)
     && /const conCodigo = conCodigoData\.meta\?\.total \|\| 0;/.test(src)
     && /setTotalCount\(total\);/.test(src)
     && /setWithCodeCount\(conCodigo\);/.test(src)
     && /setWithoutCodeCount\(total - conCodigo\);/.test(src));
  ok('ningun contador se calcula filtrando filas en el navegador',
     !/setTotalCount\(allItems/.test(src)
     && !/setWithCodeCount\(allItems/.test(src)
     && !/setWithoutCodeCount\(allItems/.test(src)
     && !/allItems\.filter\(/.test(src));
  //  El mismo `limit=100000` estaba en el boton de autogenerar: "TODOS los
  //  productos faltantes" eran los faltantes de la primera pagina de 20.
  ok('autogenerar los pide filtrados por el servidor, no filtrando una pagina',
     /has_barcode=false&page=\$\{paginaFaltantes\}/.test(src)
     && !/const missing = allItems\.filter/.test(src));
  ok('y recorre las paginas hasta agotarlas',
     /paginasFaltantes = data\.meta\?\.total_pages \|\| 1;/.test(src)
     && /while \(paginaFaltantes <= paginasFaltantes\)/.test(src));
  ok('y si cualquiera de las dos cuentas falla, no se enseña media verdad',
     /if \(statsData\.success && conCodigoData\.success\)/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL TAMANO DE PAGINA, EN UN SOLO SITIO');
// ─────────────────────────────────────────────────────────────────────────
const TRAMO = [
  { f: BARRAS, etiqueta: 'productos', tam: 15, pide: 'per_page=${itemsPerPage}' },
  { f: PAGOS, etiqueta: 'pagos', tam: 20, pide: 'pageSize: String(itemsPerPage),' },
  { f: PRODUCTOS, etiqueta: 'productos', tam: 20, pide: 'per_page: String(itemsPerPage),' },
] as const;

for (const t of TRAMO) {
  const src = codigo(t.f);
  ok(`${t.f.split('/').slice(-2).join('/')}: el tamano sale a una constante, y es la que se pide`,
     new RegExp(`const itemsPerPage = ${t.tam};`).test(src) && src.includes(t.pide));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('C. LAS TRES USAN EL COMPONENTE');
// ─────────────────────────────────────────────────────────────────────────
for (const t of TRAMO) {
  const src = codigo(t.f);
  const nombre = t.f.split('/').slice(-2).join('/');
  ok(`${nombre}: importa el componente`,
     src.includes("import { Pagination } from '@/components/ui/pagination';"));
  //  Ojo: el cuerpo del elemento lleva `=>` (products cambia de pagina con una
  //  llamada), asi que una ventana `[^>]*` se corta ahi. Se mira dentro de una
  //  ventana de caracteres cualesquiera, acotada.
  ok(`${nombre}: lo pinta con su tamano y el nombre de lo que cuenta`,
     new RegExp(`<Pagination[\\s\\S]{0,400}pageSize=\\{itemsPerPage\\}`).test(src)
     && new RegExp(`<Pagination[\\s\\S]{0,400}itemLabel="${t.etiqueta}"`).test(src)
     && new RegExp(`<Pagination[\\s\\S]{0,400}hideControlsWhenSinglePage`).test(src));
  ok(`${nombre}: sin la barra escrita a mano`,
     !/Mostrando página/.test(src) && !/Pág\. \{page\} de \{totalPages\}/.test(src));
}

// El total que enseña cada una es el de lo que se esta enseñando.
{
  ok('barras: guarda el total DE LO FILTRADO para la barra de abajo',
     /const \[totalItems, setTotalItems\] = useState\(0\);/.test(codigo(BARRAS))
     && /setTotalItems\(data\.meta\?\.total \|\| 0\);/.test(codigo(BARRAS))
     && /<Pagination[\s\S]{0,200}totalItems=\{totalItems\}/.test(codigo(BARRAS)));
  ok('pagos: el total que ya guardaba es el que se enseña',
     /<Pagination[\s\S]{0,200}totalItems=\{paymentsTotal\}/.test(codigo(PAGOS)));
  //  En productos, cambiar de pagina NO es `setPage`: hay que volver a pedir,
  //  porque es `fetchProducts` quien descarta las respuestas que llegan tarde
  //  (lote 111). Un `onPageChange={setPage}` aqui dejaria la lista quieta.
  ok('productos: cambiar de pagina vuelve a pedir, no solo mueve el numero',
     /onPageChange=\{\(nueva\) => fetchProducts\(search, selectedCategory, nueva\)\}/.test(codigo(PRODUCTOS))
     && !/<Pagination[\s\S]{0,200}onPageChange=\{setPage\}/.test(codigo(PRODUCTOS)));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
