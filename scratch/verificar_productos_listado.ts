/**
 * Banco del lote 111: el listado de productos enseña lo que se busco, y
 * guardar no te saca de tu pagina.
 *
 *     pnpm exec tsx scratch/verificar_productos_listado.ts
 *
 * LOS TRES FALLOS (dashboard/products/page.tsx)
 * ---------------------------------------------
 * 1. DOS PETICIONES POR TECLA, Y GANA LA QUE LLEGUE ULTIMA. El `onChange` del
 *    buscador llamaba a `fetchProducts` en el acto, y ademas el efecto con
 *    retardo de 500 ms volvia a llamarla. Nada descartaba respuestas viejas:
 *    si la de "pue" llegaba despues que la de "puerta", la tabla enseñaba los
 *    resultados de "pue" con "puerta" escrito en el buscador.
 *
 * 2. LA BUSQUEDA IBA SIN CODIFICAR. `search=${searchQuery}` pegado a la URL:
 *    un `&` cortaba la consulta, un `#` la truncaba, un `+` llegaba como
 *    espacio. MEDIDO (READ ONLY): 0 de 87 productos llevan esos caracteres en
 *    nombre o codigo, asi que hoy esta latente -- pero lo que escribe el
 *    usuario no lo decide la base.
 *
 * 3. GUARDAR Y "REINTENTAR" VOLVIAN A LA PAGINA 1. `fetchProducts` tiene
 *    `pageNum = 1` por defecto y esas llamadas no pasaban la pagina. Editar un
 *    producto de la pagina 4 te devolvia a la 1.
 *
 * EL ARREGLO, SIN REHACER LA PANTALLA
 * -----------------------------------
 * Cada peticion lleva un numero, y solo la ultima escribe en la tabla. El
 * buscador solo cambia el texto y el efecto con retardo es el unico que pide.
 * La URL se arma con `URLSearchParams`. Guardar y reintentar piden la pagina
 * en la que estabas.
 */
import fs from 'fs';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const PANT = 'src/app/dashboard/products/page.tsx';
const src = codigo(PANT);

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(src.length > 50_000, `No se pudo leer ${PANT}`);
exige(src.includes('const fetchProducts = async (searchQuery = search, catId = selectedCategory, pageNum = 1) => {'),
      'la firma de fetchProducts cambio: revisar el razonamiento de la pagina por defecto');
//  QUITAR la peticion inmediata del buscador solo es seguro si el efecto con
//  retardo sigue pidiendo al cambiar el texto.
exige(/setTimeout\(\(\) => \{\s*fetchProducts\(search, selectedCategory, 1\);\s*\}, 500\);/.test(src)
      && /\}, \[search\]\);/.test(src),
      'el efecto con retardo del buscador ya no pide productos: quitar la peticion inmediata perderia la busqueda');
//  La API lee `search` con searchParams, que decodifica: codificar en la
//  pantalla es lo que le corresponde.
exige(codigo('src/app/api/v1/products/route.ts').includes("const search = searchParams.get('search') || undefined;"),
      'la API de productos ya no lee search de searchParams');

const carga = bloque(src, 'const fetchProducts = async (');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. SOLO LA ULTIMA PETICION ESCRIBE EN LA TABLA');
// ─────────────────────────────────────────────────────────────────────────
ok('hay un contador de peticiones que sobrevive a los renders',
   src.includes('const ultimaPeticion = useRef(0);'));
ok('cada peticion toma su numero al empezar',
   carga.includes('const estaPeticion = ++ultimaPeticion.current;'));
ok('y si llega tarde, no toca nada',
   /const data = await res\.json\(\);\s*if \(estaPeticion !== ultimaPeticion\.current\) return;/.test(carga));
//  Tambien el error: un fallo viejo no puede tapar un resultado nuevo.
ok('ni con un error viejo',
   /catch \(error\) \{\s*if \(estaPeticion !== ultimaPeticion\.current\) return;/.test(carga));
ok('y el "cargando" lo apaga solo la ultima',
   /finally \{\s*if \(estaPeticion === ultimaPeticion\.current\) setLoading\(false\);/.test(carga));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. UNA PETICION POR BUSQUEDA, BIEN ESCRITA');
// ─────────────────────────────────────────────────────────────────────────
const buscador = bloque(src, 'onChange={(val) => {');
ok('el buscador solo cambia el texto; pide el efecto con retardo',
   buscador.includes('setSearch(val);') && !buscador.includes('fetchProducts('));
// El tamano de pagina iba escrito aqui a mano; desde el lote 132 vive en una
// constante que se usa tambien para pintar el rango. Lo que esta comprobacion
// vigila es que la URL SE ARME (que el texto no se pegue a mano), no donde
// este escrito el 20: se acepta de las dos formas.
ok('la URL se arma con URLSearchParams',
   /new URLSearchParams\(\{\s*search: searchQuery,\s*page: String\(pageNum\),\s*per_page: (?:'20'|String\(itemsPerPage\)),\s*\}\)/.test(carga)
   && carga.includes("if (catId) params.set('categoryId', catId);")
   && carga.includes('fetch(`/api/v1/products?${params.toString()}`)'));
ok('y ya no se pega el texto a mano', !carga.includes('search=${searchQuery}'));

// ─────────────────────────────────────────────────────────────────────────
console.log('C. GUARDAR Y REINTENTAR TE DEJAN DONDE ESTABAS');
// ─────────────────────────────────────────────────────────────────────────
ok('al guardar se vuelve a pedir la pagina actual',
   /setShowModal\(false\);\s*fetchProducts\(search, selectedCategory, page\);/.test(src));
ok('"Reintentar" tambien, en los dos sitios donde aparece',
   (src.match(/onReintentar=\{\(\) => fetchProducts\(search, selectedCategory, page\)\}/g) ?? []).length === 2);
ok('y no queda ninguna llamada que caiga a la pagina 1 sin pedirlo',
   !/fetchProducts\(\)/.test(src) && !/fetchProducts\(search, selectedCategory\)/.test(src));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
