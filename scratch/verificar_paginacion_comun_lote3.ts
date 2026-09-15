/**
 * Banco del lote 130 (P3-45, tercer tramo): cotizaciones y movimientos de
 * inventario paginan con el componente comun.
 *
 *     pnpm exec tsx scratch/verificar_paginacion_comun_lote3.ts
 *
 * ESTAS DOS PAGINAN EN EL SERVIDOR, y ahi hay un detalle que las anteriores no
 * tenian: el tamano de pagina viajaba escrito a mano dentro de la URL
 * (`per_page: '10'`, `limit: '20'`) y el texto de abajo no lo usaba. El
 * componente calcula el rango que enseña ("Mostrando 11 - 20 de 57") a partir
 * del tamano, asi que si el numero de la URL y el del componente se separan, el
 * rango miente. Por eso cada pantalla saca su tamano a una constante y la usa
 * en los DOS sitios: lo que se pide y lo que se enseña.
 *
 * El texto cambia un poco a proposito: cotizaciones decia "Mostrando 10 de 57
 * cotizaciones" (lo que llego, no en que pagina va) y movimientos solo decia
 * "Total: 57". Ahora las dos dicen el rango y el total.
 *
 * NO ENTRA AQUI el panel de inicio: su texto lleva ademas "(Historial total:
 * N)", un dato que el componente no enseña, y cambiarlo perderia informacion.
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

const COTIZ = 'src/app/dashboard/quotes/page.tsx';
const MOVIM = 'src/app/dashboard/inventory/movements/page.tsx';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(codigo(COTIZ).includes("url.searchParams.set('per_page'"), 'cotizaciones ya no pide per_page');
exige(codigo(MOVIM).includes("limit:"), 'movimientos ya no pide limit');
exige(/setTotalPages\(data\.meta\?\.totalPages \|\| 1\);/.test(codigo(COTIZ)), 'cotizaciones ya no lee meta.totalPages');
exige(/setTotalPages\(data\.data\.totalPages\);/.test(codigo(MOVIM)), 'movimientos ya no lee data.totalPages');
{
  const p = codigo('src/components/ui/pagination.tsx');
  exige(p.includes('itemLabel = "registros"') && p.includes('hideControlsWhenSinglePage = false'),
        'el componente ya no trae las opciones del lote 128 con su valor por defecto');
  //  El rango sale del tamano de pagina: por eso hay que pasarle el mismo que
  //  se pide a la API.
  exige(p.includes('const endItem = totalItems ? Math.min(currentPage * pageSize, totalItems) : undefined;'),
        'el componente ya no calcula el rango con pageSize');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL TAMANO DE PAGINA, UNO SOLO POR PANTALLA');
// ─────────────────────────────────────────────────────────────────────────
{
  const src = codigo(COTIZ);
  ok('cotizaciones: la constante se pide a la API y se le pasa al componente',
     src.includes('const itemsPerPage = 10;')
     && src.includes("url.searchParams.set('per_page', String(itemsPerPage));")
     && !/url\.searchParams\.set\('per_page', '\d+'\)/.test(src));
}
{
  const src = codigo(MOVIM);
  ok('movimientos: la constante se pide a la API y se le pasa al componente',
     src.includes('const itemsPerPage = 20;')
     && src.includes('limit: String(itemsPerPage),')
     && !/limit: '\d+',\s*\n/.test(src.slice(src.indexOf('const fetchMovements'), src.indexOf('const fetchMovements') + 1200)));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LAS DOS USAN EL COMPONENTE');
// ─────────────────────────────────────────────────────────────────────────
for (const [f, total, etiqueta] of [[COTIZ, 'totalRecords', 'cotizaciones'], [MOVIM, 'totalItems', 'movimientos']] as const) {
  const src = codigo(f);
  ok(`${f.split('/').slice(-2).join('/')}: importa el componente`,
     src.includes("import { Pagination } from '@/components/ui/pagination';"));
  ok(`${f.split('/').slice(-2).join('/')}: con su pagina, su total y su nombre`,
     new RegExp(`<Pagination\\s+currentPage=\\{page\\}\\s+totalPages=\\{totalPages\\}\\s+totalItems=\\{${total}\\}\\s+pageSize=\\{itemsPerPage\\}\\s+onPageChange=\\{setPage\\}\\s+itemLabel="${etiqueta}"`).test(src));
  ok(`${f.split('/').slice(-2).join('/')}: sin la barra escrita a mano`,
     src.includes('<Pagination') && !/Pág\. \{page\} de \{totalPages\}/.test(src) && !/\{page\} \/ \{Math\.max\(1, totalPages\)\}/.test(src));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
