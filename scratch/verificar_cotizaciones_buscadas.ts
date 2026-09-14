/**
 * Banco del lote 110: buscar una cotizacion la encuentra, este en la pagina
 * que este.
 *
 *     pnpm exec tsx scratch/verificar_cotizaciones_buscadas.ts
 *
 * LOS DOS FALLOS, QUE SE TAPABAN EL UNO AL OTRO
 * ---------------------------------------------
 * 1. La busqueda ("Cliente / No. Cotizacion") filtraba en el navegador la
 *    pagina que ya habia llegado. Una cotizacion de otra pagina no aparecia:
 *    "0 cotizaciones", existiendo. La misma clase de fallo que el lote 109 en
 *    la pantalla de notas.
 *
 * 2. La pantalla pedia `per_page=10` y la API leia `limit`. No se entendian:
 *    la API servia paginas de 50 y la pantalla creia que eran de 10. Es lo que
 *    ha tapado el fallo 1 hasta hoy.
 *
 * MEDIDO (2026-09-14, READ ONLY): 11 cotizaciones en PRODUCCION, cero
 * borradas. Con paginas de 50 cabe todo en la primera y la busqueda local
 * "funciona". La cotizacion 51 ya no la encontraria nadie buscando.
 *
 * EL ARREGLO
 * ----------
 * La busqueda va a la consulta que pagina (`q`: numero, cliente o total), y la
 * API entiende `per_page` -- el nombre que usan las demas listas -- sin dejar
 * de entender `limit`. La pantalla manda `q` con un retardo corto para no
 * lanzar una consulta por tecla, y vuelve a la pagina 1 al cambiar lo buscado.
 *
 * De paso, el listado y el conteo excluyen las borradas, como ya hacian las
 * estadisticas de la misma funcion. Hoy no hay ninguna (no hay ruta de
 * borrado): es que las tres consultas digan lo mismo.
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

const API = 'src/app/api/v1/quotes/route.ts';
const SRV = 'src/services/quoteService.ts';
const PANT = 'src/app/dashboard/quotes/page.tsx';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
for (const f of [API, SRV, PANT]) exige(crudo(f).length > 1000, `No se pudo leer ${f}`);
exige(codigo(SRV).includes('static async getQuotes('), 'getQuotes ya no esta en QuoteService');
//  La razon del fallo: se pagina en la base.
exige(/\.limit\(limit\)\s*\.offset\(offset\)/.test(codigo(SRV)), 'getQuotes ya no pagina en la base');
//  La pantalla pide paginas de 10: es lo que la API no entendia.
exige(codigo(PANT).includes("url.searchParams.set('per_page', '10');"),
      'la pantalla de cotizaciones ya no pide per_page=10');
//  Nadie mas lista cotizaciones con esta API: cambiarle parametros no rompe a
//  otro. (`quotes/new` hace POST, no GET.)
exige(codigo('src/app/dashboard/quotes/new/page.tsx').includes("fetch('/api/v1/quotes', {"),
      'quotes/new ya no hace POST a /api/v1/quotes');
//  Las estadisticas ya excluian las borradas: es el modelo a seguir.
exige(codigo(SRV).includes('sql`deleted_at is null`'), 'las estadisticas ya no excluyen borradas');

const firma = bloque(codigo(SRV), 'static async getQuotes(');
//  `bloque` busca la primera llave tras el marcador, que en una firma sin
//  tipos de objeto es el cuerpo. Se localiza tambien el tramo de la firma.
const inicio = codigo(SRV).indexOf('static async getQuotes(');
const cabecera = codigo(SRV).slice(inicio, codigo(SRV).indexOf('{', inicio));

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LA API ENTIENDE A LA PANTALLA');
// ─────────────────────────────────────────────────────────────────────────
const api = codigo(API);
ok("lee per_page, y sigue entendiendo limit",
   api.includes("const perPage = parseInt(searchParams.get('per_page') || searchParams.get('limit') || '50', 10);"));
ok('lee q y se lo pasa al servicio',
   api.includes("const q = searchParams.get('q')?.trim() || undefined;")
   && api.includes('QuoteService.getQuotes(auth.companyId, auth.modo, page, perPage, status, q)'));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LA BUSQUEDA VA A LA CONSULTA QUE PAGINA');
// ─────────────────────────────────────────────────────────────────────────
ok('getQuotes recibe lo buscado', /\bq\?: string\s*\)/.test(cabecera));
ok('busca por numero, cliente o total, sin distinguir mayusculas',
   firma.includes('ilike(quotes.sequenceNumber, patron)')
   && firma.includes('ilike(customers.name, patron)')
   && firma.includes('ilike(sql`${quotes.total}::text`, patron)'));
ok('y lo busca DENTRO de la condicion comun (listado y conteo)',
   /if \(q\) \{[\s\S]*?whereClause = and\(whereClause, or\(/.test(firma));
//  El cliente esta en otra tabla: sin el join, el conteo contaria sin poder
//  mirar el nombre y "Pagina X de Y" volveria a mentir.
ok('el conteo hace el mismo join que el listado',
   /select\(\{ count: sql<number>`count\(\*\)` \}\)\s*\.from\(quotes\)\s*\.leftJoin\(customers, eq\(quotes\.customerId, customers\.id\)\)\s*\.where\(whereClause\)/
     .test(firma));
ok('los comodines que escriba el usuario no actuan como comodines',
   firma.includes("const patron = `%${q.replace(/[\\\\%_]/g, (c) => `\\\\${c}`)}%`;"));
ok('listado y conteo excluyen las borradas, como las estadisticas',
   firma.includes('isNull(quotes.deletedAt)')
   && /let whereClause: SQL \| undefined = and\(eq\(quotes\.companyId, companyId\), eq\(quotes\.modo, modo\), isNull\(quotes\.deletedAt\)\);/.test(firma));

// ─────────────────────────────────────────────────────────────────────────
console.log('C. LA PANTALLA PREGUNTA, NO FILTRA');
// ─────────────────────────────────────────────────────────────────────────
const pant = codigo(PANT);
const carga = bloque(pant, 'const fetchQuotes = useCallback(');
ok('manda lo buscado al servidor', carga.includes("if (busqueda) url.searchParams.set('q', busqueda);"));
ok('y vuelve a pedir cuando cambia', /\}, \[page, statusFilter, busqueda\]\);/.test(pant));
ok('con un retardo corto, no una consulta por tecla',
   /setTimeout\(\(\) => \{\s*setBusqueda\(searchTerm\.trim\(\)\);\s*setPage\(1\);\s*\}, 300\)/.test(pant)
   && /return \(\) => clearTimeout\(/.test(pant));
ok('ya no filtra en el navegador la pagina que llego',
   !pant.includes('filteredQuotes') && !/quotes\.filter\(/.test(pant));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
