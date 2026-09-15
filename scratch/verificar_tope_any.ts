/**
 * Banco del lote 123: un tope global de `any` en la capa de servidor, que solo
 * puede bajar.
 *
 *     pnpm exec tsx scratch/verificar_tope_any.ts
 *
 * POR QUE HACE FALTA
 * ------------------
 * P1-24 dejo `src/services`, `src/repositories` y `src/middleware` en CERO
 * `: any`. Los bancos de P1-24 miran fichero a fichero los que se tiparon, asi
 * que un `any` escrito despues en un fichero NUEVO no lo ve ninguno. Medido el
 * 2026-09-14 (sin comentarios): habian vuelto 3 `: any` -- dos en
 * `cartera/documentos.ts` y uno en `carteraRepository.ts`, escritos con la
 * Antiguedad de Saldos (P2-36) -- y `quoteService.ts` tenia 5 `(line as any)`
 * sobre campos que `getQuote` ya selecciona con tipo (411fd03).
 *
 * EL TRINQUETE
 * ------------
 * Se cuentan, sin comentarios, `: any` y `as any` en las tres carpetas. `: any`
 * vuelve a 0 en este lote y el techo es 0. `as any` baja de 32 a 27 (los 5 de
 * quoteService) y el techo es 27: los que quedan son moldes antiguos
 * (arRepository, accountingRepository, auth.ts...) que se iran bajando; cuando
 * baje, bajar el techo aqui. Subirlo es una regresion.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean, d = ''): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!x) fallos++;
}

const TECHO_DOS_PUNTOS_ANY = 0;
const TECHO_AS_ANY = 27;

function contar(): { dosPuntos: number; asAny: number; donde: string[] } {
  let dosPuntos = 0; let asAny = 0; const donde: string[] = [];
  for (const carpeta of ['services', 'repositories', 'middleware']) {
    const base = path.join('src', carpeta);
    if (!fs.existsSync(base)) throw new Error(`No existe ${base}: el tope no puede contar.`);
    (function andar(d: string) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) andar(p);
        else if (/\.tsx?$/.test(e.name)) {
          const t = sinComentarios(fs.readFileSync(p, 'utf8'));
          const a = (t.match(/:\s*any\b/g) || []).length;
          const b = (t.match(/\bas any\b/g) || []).length;
          dosPuntos += a; asAny += b;
          if (a) donde.push(`${p.split(path.sep).join('/')} (${a} ': any')`);
        }
      }
    })(base);
  }
  return { dosPuntos, asAny, donde };
}

const { dosPuntos, asAny, donde } = contar();
console.log(`\n        ': any' en services/repositories/middleware : ${dosPuntos}   (techo ${TECHO_DOS_PUNTOS_ANY})`);
console.log(`        'as any'                                   : ${asAny}   (techo ${TECHO_AS_ANY})\n`);

ok("no hay ningun ': any' en la capa de servidor", dosPuntos <= TECHO_DOS_PUNTOS_ANY, donde.join(', '));
ok("los 'as any' no suben", asAny <= TECHO_AS_ANY, `${asAny} vs techo ${TECHO_AS_ANY}`);
if (asAny < TECHO_AS_ANY) console.log(`\n        (bajo de ${TECHO_AS_ANY} a ${asAny}: baja TECHO_AS_ANY a ${asAny} en este fichero)`);

//  Los tres sitios que motivaron el lote, con su tipo, para que no se "arreglen"
//  con un `unknown` que obligue a castear en cada uso.
const doc = sinComentarios(fs.readFileSync('src/services/cartera/documentos.ts', 'utf8'));
const rep = sinComentarios(fs.readFileSync('src/repositories/carteraRepository.ts', 'utf8'));
const quo = sinComentarios(fs.readFileSync('src/services/quoteService.ts', 'utf8'));
ok('cartera/documentos: las filas en bruto tienen forma declarada',
   /export function normalizarFila\(bruta: FilaBruta \| null \| undefined, tipo: TipoCuenta/.test(doc)
   && /export const normalizarFilas = \(brutas: \(FilaBruta \| null \| undefined\)\[\] \| null \| undefined, tipo: TipoCuenta/.test(doc));
ok('carteraRepository: armar recibe filas con forma declarada',
   /private static armar\(\s*filas: FilaEntidadCartera\[\],/.test(rep));
ok('quoteService: las lineas de la cotizacion ya no se castean a any',
   quo.includes('productName: line.productName ?? null,') && !/\(line as any\)/.test(quo));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
