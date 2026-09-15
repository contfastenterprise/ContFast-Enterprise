/**
 * Banco del lote 127: el listado de cotizaciones hace sus tres consultas a la vez.
 *
 *     pnpm exec tsx scratch/verificar_cotizaciones_en_paralelo.ts
 *
 * `QuoteService.getQuotes` esperaba el listado, luego el conteo y luego las
 * estadisticas: tres idas y vueltas a la base en fila, y ninguna depende de la
 * otra. En produccion el pool de postgres.js es de 2 conexiones
 * (src/db/index.ts), asi que a la vez van dos y la tercera espera a la primera
 * que acabe: se ahorra una espera de tres. Poco, pero es la pantalla que se abre
 * al buscar una cotizacion, y no cuesta nada.
 *
 * No cambia QUE se consulta: la condicion del listado y del conteo (con el
 * join de la busqueda) y la de las estadisticas quedan exactamente igual.
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
const src = sinComentarios(fs.readFileSync('src/services/quoteService.ts', 'utf8').replace(/\r\n/g, '\n'));
const cuerpo = bloque(src, 'static async getQuotes(');

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(cuerpo.length > 500, 'no se encontro getQuotes');
//  Lo que se consulta no cambia: se fija antes y despues.
exige(cuerpo.includes('.limit(limit)') && cuerpo.includes('.offset(offset)'), 'el listado ya no pagina');
exige(/count: sql<number>`count\(\*\)`/.test(cuerpo), 'ya no hay conteo');
exige(cuerpo.includes('pendingCount: sql<number>'), 'ya no hay estadisticas');
//  `[;,]`: suelta la consulta acaba en `;`, dentro de Promise.all en `,`. La
//  primera version exigia `;` y la precondicion revento con el arreglo puesto.
exige(/\.from\(quotes\)\s*\.leftJoin\(customers, eq\(quotes\.customerId, customers\.id\)\)\s*\.where\(whereClause\)[;,]/.test(cuerpo),
      'el conteo ya no hace el join de la busqueda (lote 110)');
//  El resultado se arma igual antes y despues: es precondicion, no comprobacion
//  (como `ok()` daba un OK gratis en la contraprueba).
exige(cuerpo.includes('total: Number(count),') && cuerpo.includes('totalAmount: Number(statsResult?.totalAmount || 0),'),
      'el resultado de getQuotes ya no se arma igual');
exige(fs.readFileSync('src/db/index.ts', 'utf8').includes("(process.env.NODE_ENV === 'production' ? 2 : 10)"),
      'el pool de produccion ya no es de 2: revisar el motivo');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LAS TRES A LA VEZ');
// ─────────────────────────────────────────────────────────────────────────
ok('las tres consultas van en un solo Promise.all',
   /const \[items, \[\{ count \}\], \[statsResult\]\] = await Promise\.all\(\[/.test(cuerpo));
ok('ninguna se espera suelta antes',
   cuerpo.includes('await Promise.all([')
   && !/const items = await db/.test(cuerpo)
   && !/const \[\{ count \}\] = await db/.test(cuerpo)
   && !/const \[statsResult\] = await db/.test(cuerpo));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
