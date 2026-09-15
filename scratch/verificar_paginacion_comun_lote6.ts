/**
 * Banco del lote 133 (P3-45, sexto y ultimo tramo de codigo): el listado de
 * e-CF y el de facturas.
 *
 *     pnpm exec tsx scratch/verificar_paginacion_comun_lote6.ts
 *
 * EN e-CF HABIA UNA INCOHERENCIA DE VERDAD, pequeña pero permanente: el texto
 * decia `meta.page` -- la pagina que CONTESTO la API -- y los botones movian
 * `page`, la que se esta pidiendo. Mientras carga son distintos, y si la
 * peticion falla (`data.success` falso no toca `meta`) se quedan distintos
 * para siempre: los botones en la 3 y el texto en la 2. Con el componente hay
 * un solo numero, `page`.
 *
 * Las dos guardaban ya su total (`meta.total`, `totalRecords`) y lo enseñaban
 * como "(N registros en total)" junto a "Mostrando página X de Y", que dice
 * cuantas paginas hay pero no en cuales filas vas. El componente enseña el
 * rango: "Mostrando 21 - 40 de 137 comprobantes".
 *
 * Y como en los tramos 3, 4 y 5, el tamano de pagina sale a una constante que
 * se usa en lo que se pide y en lo que se enseña; si los dos numeros se
 * separan, el rango miente.
 *
 * NO ENTRA el panel de inicio, el unico bloque de paginacion a mano que queda:
 * su texto lleva "(Historial total: N)", un dato que el componente no enseña,
 * y cambiarlo perderia informacion.
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

/**
 * Las barras escritas a mano de este repositorio, en sus cuatro formas. La de
 * e-CF era `Página {meta.page} de {meta.total_pages}`: buscar solo "Mostrando
 * página" la dejaba pasar, y la comprobacion se regalaba un OK en la
 * contraprueba. Se mira la FORMA -- un numero interpolado, "de", otro numero
 * interpolado --, no una frase concreta.
 */
const barraAMano = (src: string) =>
  /Mostrando página/.test(src)
  || /registros en total/.test(src)
  || /Pág\. \{/.test(src)
  || /Página \{[^}]+\} de \{[^}]+\}/.test(src);

const ECF = 'src/app/dashboard/ecf/page.tsx';
const FACTURAS = 'src/app/dashboard/invoices/page.tsx';
const INICIO = 'src/app/dashboard/page.tsx';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const p = codigo('src/components/ui/pagination.tsx');
  exige(p.includes('itemLabel = "registros"'), 'el componente ya no trae itemLabel con su valor por defecto');
  exige(p.includes('const endItem = totalItems ? Math.min(currentPage * pageSize, totalItems) : undefined;'),
        'el componente ya no calcula el rango con pageSize');
  exige(p.includes('const safeTotalPages = Math.max(1, totalPages);'),
        'el componente ya no se defiende de un total_pages en 0 (e-CF empieza asi)');
}
//  Las dos APIs dan el total; sin el, enseñar un rango seria inventarlo.
exige(codigo('src/app/api/v1/ecf/route.ts').includes('total_pages: Math.ceil(total / perPage),'),
      'la API de e-CF ya no devuelve total');
//  Y e-CF sigue guardando entero el meta que le contestan: de ahi sale el total.
exige(codigo(ECF).includes('setMeta(data.meta);'), 'la pantalla de e-CF ya no guarda el meta de la API');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. UN SOLO NUMERO DE PAGINA EN e-CF');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(ECF);
  ok('el numero que se enseña es el que mueven los botones, no el que contesto la API',
     !/Página \{meta\.page\}/.test(src)
     && !/currentPage=\{meta\.page\}/.test(src)
     && /<Pagination[\s\S]{0,400}currentPage=\{page\}/.test(src));
  ok('y sigue siendo la API quien dice cuantas paginas y cuantos hay',
     /<Pagination[\s\S]{0,400}totalPages=\{meta\.total_pages\}/.test(src)
     && /<Pagination[\s\S]{0,400}totalItems=\{meta\.total\}/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL TAMANO DE PAGINA, EN UN SOLO SITIO');
// ─────────────────────────────────────────────────────────────────────────
const TRAMO = [
  { f: ECF, nombre: 'e-CF', etiqueta: 'comprobantes', tam: 20, pide: 'per_page: String(itemsPerPage) }' },
  { f: FACTURAS, nombre: 'facturas', etiqueta: 'facturas', tam: 10, pide: 'per_page: String(itemsPerPage),' },
] as const;

for (const t of TRAMO) {
  const src = codigo(t.f);
  ok(`${t.nombre}: el tamano sale a una constante, y es la que se pide`,
     new RegExp(`const itemsPerPage = ${t.tam};`).test(src) && src.includes(t.pide));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('C. LAS DOS USAN EL COMPONENTE');
// ─────────────────────────────────────────────────────────────────────────
for (const t of TRAMO) {
  const src = codigo(t.f);
  ok(`${t.nombre}: importa el componente`,
     src.includes("import { Pagination } from '@/components/ui/pagination';"));
  ok(`${t.nombre}: lo pinta con su tamano y el nombre de lo que cuenta`,
     new RegExp(`<Pagination[\\s\\S]{0,400}pageSize=\\{itemsPerPage\\}`).test(src)
     && new RegExp(`<Pagination[\\s\\S]{0,400}itemLabel="${t.etiqueta}"`).test(src)
     && new RegExp(`<Pagination[\\s\\S]{0,400}hideControlsWhenSinglePage`).test(src));
  ok(`${t.nombre}: sin la barra escrita a mano`, !barraAMano(src));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('D. Y NO QUEDA NINGUNA BARRA A MANO, SALVO LA DEL PANEL DE INICIO');
// ─────────────────────────────────────────────────────────────────────────
{
  //  La excepcion anotada va de PRECONDICION, no de comprobacion: es cierta
  //  igual antes y despues del lote, asi que como `ok()` regalaria un OK en la
  //  contraprueba. Como precondicion si sirve: si alguien migra el panel de
  //  inicio sin resolver lo del "(Historial total: N)", esto revienta y hay
  //  que mirarlo.
  const inicio = codigo(INICIO);
  exige(/Historial total:/.test(inicio) && !inicio.includes("import { Pagination } from '@/components/ui/pagination';"),
        'el panel de inicio ya no es la excepcion anotada: o perdio el "(Historial total: N)" o paso al componente');

  const pantallas = fs.readdirSync('src/app/dashboard', { recursive: true, encoding: 'utf8' })
    .filter((r) => r.replace(/\\/g, '/').endsWith('page.tsx'))
    .map((r) => 'src/app/dashboard/' + r.replace(/\\/g, '/'))
    .filter((r) => r !== INICIO);
  const conBarraAMano = pantallas.filter((f) => barraAMano(codigo(f)));
  ok(`ninguna otra pantalla escribe su barra a mano (sobran: ${conBarraAMano.join(', ') || 'ninguna'})`,
     conBarraAMano.length === 0);
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
