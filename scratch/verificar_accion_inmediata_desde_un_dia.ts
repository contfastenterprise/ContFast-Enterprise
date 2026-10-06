/**
 * Lote 307: "Accion inmediata" del Balance Operativo empieza en el PRIMER dia de atraso, y
 * "En observacion" se retira.
 *
 * Decision del dueño (2026-10-05): *"haz que Accion inmediata tambien empiece en 1 dia"*, tras
 * el lote 306 (Cartera en Riesgo desde 1 dia). Preguntado que hacer con "En observacion" (1 a 15
 * dias), que quedaba entera dentro: quitarla. Asi el Balance Operativo son DOS cifras, "Por
 * vencer" y "Accion inmediata", y entre las dos suman el total.
 *
 * La pantalla (`antiguedad-saldos/page.tsx`) pide sus datos por red y no se puede dibujar sin
 * DOM de pruebas, asi que se mira el bloque del Balance Operativo acotado entre su titulo y el
 * pie de la seccion. Las cifras salen de `saldoDe(nivel)`, que es `sumarPorNivel` (lote 304).
 *
 * Uso: npx tsx scratch/verificar_accion_inmediata_desde_un_dia.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

let fallos = 0;
let oks = 0;
const ok = (etiqueta: string, cond: boolean, detalle?: unknown) => {
  if (cond) { oks++; console.log(`  OK    ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}${detalle !== undefined ? ` -> ${JSON.stringify(detalle)}` : ''}`); }
};
const raiz = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8');

const pagina = leer('src/app/dashboard/antiguedad-saldos/page.tsx');
const i = pagina.indexOf('Balance Operativo\n'.trim());
const j = pagina.indexOf('Haz clic en la dona', i);
if (i < 0 || j < 0) throw new Error('precondicion: no se encuentra el bloque del Balance Operativo');
const bloque = pagina.slice(i, j);

// La tarjeta de "Accion inmediata": desde su rotulo hasta el cierre de su caja.
const k = bloque.indexOf('Acción inmediata');
if (k < 0) throw new Error('precondicion: el Balance Operativo no tiene "Acción inmediata"');
const accion = bloque.slice(k, bloque.indexOf('</div>', k));
// Lo que se suma: el argumento de dineroCorto dentro de esa tarjeta, sin espacios.
const suma = ((accion.match(/dineroCorto\(([^\n]*)\)\}/) ?? [])[1] ?? '').replace(/\s+/g, '');

console.log('\n1) La cifra\n');
ok('"Acción inmediata" suma riesgo medio (1 a 15 dias), alto y critico',
  suma === "saldoDe('medio')+saldoDe('alto')+saldoDe('critico')", suma);
ok('y no suma lo que aun no vence (bajo)', suma.includes("saldoDe('medio')") && !suma.includes("'bajo'"), suma);
ok('su rotulo dice "Facturas con 1 día de atraso o más"', /Facturas con 1 día de atraso o más/.test(accion));
ok('y ya no dice "más de 15 días"', /1 día de atraso o más/.test(accion) && !/más de 15 días/.test(accion));

console.log('\n2) "En observación" se retira\n');
ok('el Balance Operativo ya no tiene "En observación"', !/En observación/.test(bloque) && /1 día de atraso o más/.test(bloque));
ok('ni ninguna otra cifra suma saldoDe(\'medio\') por su cuenta (no sale dos veces)',
  // Atada a la marca positiva: antes del lote tambien salia una vez, pero en "En observacion".
  (bloque.match(/saldoDe\('medio'\)/g) ?? []).length === 1 && suma.includes("saldoDe('medio')"),
  (bloque.match(/saldoDe\('medio'\)/g) ?? []).length);
ok('la rejilla es de dos columnas, sin un hueco para la tercera',
  /<div className="grid grid-cols-2 gap-2\.5 mb-3">/.test(bloque) && !/sm:grid-cols-3/.test(bloque) && !/col-span-2/.test(bloque));
{
  // Invariante: "Por vencer" sigue siendo el nivel bajo (cierto antes y despues).
  const pv = bloque.slice(bloque.indexOf('Por vencer'));
  if (!/dineroCorto\(saldoDe\('bajo'\)\)/.test(pv.slice(0, 300))) { fallos++; console.log('  INV   "Por vencer" dejo de ser el nivel bajo'); }
  else console.log('  inv   "Por vencer" sigue siendo lo que aun no vence');
}

console.log('\n3) El manual\n');
const m = leer('scripts/generate-manual.js');
const li = (m.match(/<li><strong>«Balance Operativo»:<\/strong>[^\n]*/) ?? [''])[0];
ok('el manual dice dos cifras: «Por vencer» y «Acción inmediata» desde 1 dia',
  /dos cifras/.test(li) && /«Acción inmediata» \(facturas con 1 día de atraso o más\)/.test(li), li.slice(0, 200));
ok('y ya no nombra «En observación» en ningun sitio', /dos cifras/.test(li) && !/En observación/.test(m));
const ver = Number((m.match(/const VERSION = '(\d+\.\d+)';/) ?? [])[1]);
ok('la version del manual es la 3.6 o posterior', ver >= 3.6, ver);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} — ${oks} OK\n`);
process.exit(fallos === 0 ? 0 : 1);
