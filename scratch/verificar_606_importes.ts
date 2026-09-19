/**
 * Lote 167 -- la pantalla del 606 se caia en cuanto el mes tenia una compra.
 *
 * "(e.amount || 0).toFixed is not a function" (reportado por el dueño el
 * 2026-09-19). Las columnas `decimal` llegan de la base como TEXTO; la ruta
 * convertia los totales pero devolvia las filas tal cual, y la pantalla -- que
 * las declara `number` -- les hacia `.toFixed(2)`. Escondido hasta el lote 134:
 * antes la ruta respondia 403 siempre y no llegaba a pintar filas.
 *
 * Solo codigo.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');

const RUTA = leer('src/app/api/v1/reports/606/route.ts');
const PAG = leer('src/app/dashboard/reports/606/page.tsx');

// La pantalla sigue tratando los importes de cada fila como numeros: es la
// premisa del arreglo (si algun dia los convierte ella, este banco se revisa).
if (!/\(e\.amount \|\| 0\)\.toFixed\(2\)/.test(PAG)) {
  throw new Error('PRECONDICION ROTA: la pantalla del 606 ya no hace (e.amount || 0).toFixed(2): revisar este banco');
}
console.log('  pre   la pantalla trata los importes de cada fila como numeros');

const get = RUTA.slice(RUTA.indexOf('export async function GET'), RUTA.indexOf('export async function POST'));
const conversion = get.slice(get.indexOf('const expenses ='), get.indexOf('const totals ='));
for (const campo of ['amount', 'itbis', 'itbisRetained']) {
  ok(`la ruta devuelve ${campo} de cada fila como numero`,
    new RegExp(`${campo}: Number\\(e\\.${campo}\\) \\|\\| 0,`).test(conversion));
}
ok('la conversion es de las filas que se devuelven (no de una copia aparte)',
  /const expenses = \(await getExpenses\(companyId, period, auth\.modo\)\)\.map\(\(e\) => \(\{\s*\.\.\.e,/.test(get)
  && /NextResponse\.json\(\{ expenses, totals \}/.test(get));
// Cierto antes y despues del arreglo (la contraprueba lo daba en OK): es una
// precondicion, no una comprobacion del arreglo.
if (!/const totals = expenses\.reduce\(/.test(get)) {
  throw new Error('PRECONDICION ROTA: los totales ya no suman las filas que se devuelven');
}
console.log('  pre   los totales suman las mismas filas que se devuelven');

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
