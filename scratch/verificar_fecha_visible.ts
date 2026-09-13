/**
 * Banco del lote 96: la fecha que lee una persona, en un solo formateador.
 *
 *     TZ=America/Santo_Domingo pnpm exec tsx scratch/verificar_fecha_visible.ts
 *
 * Es la capa 1 de tres. Aqui solo cambia `utils/fechasLocales.ts`; las
 * pantallas (capa 2) y los impresos (capa 3) vienen despues. Lo que ya usaba
 * `formatDateDisplay` -- la cartera, las tarjetas del kanban, las compras --
 * hereda el formato nuevo sin tocar una linea.
 *
 * QUE SE MIDIO ANTES DE TOCAR NADA
 * --------------------------------
 * Sobre 54 ficheros, releidos frescos del repo:
 *
 *     147  toLocaleDateString
 *      22  formatDateDisplay / formatDateShort
 *      15  toLocaleString con hora
 *      61  de los `new Date(...).toLocale*` reciben una columna `date`
 *          y por tanto pintan UN DIA MENOS
 *
 * Cinco formatos distintos conviviendo, y ninguno era dd-MM-aaaa:
 *
 *     toLocaleDateString('es-DO')          "2/9/2026"    sin relleno
 *     formatDateDisplay (el de antes)      "02/09/2026"  con barras
 *     toLocaleString con hora              "2/9/2026, 12:00:00 a. m."
 *
 * LO QUE FIJA ESTE BANCO
 * ----------------------
 *   A. dd-MM-aaaa con relleno, para una cadena y para un `Date`.
 *   B. Una columna `date` ya NO se corre un dia. Se compara contra lo que
 *      hacia `toLocaleDateString`, reimplementado, para que el "antes" no
 *      sea una afirmacion sino algo que se ejecuta.
 *   C. Una marca de tiempo sigue enseñando SU dia local, que es lo correcto.
 *   D. La hora: 24 horas, rellena, sin segundos, y solo cuando existe.
 *   E. Ni ausencias tapadas ni datos inventados.
 */
import { fuente } from './_fuente';
import { formatDateDisplay, formatDateTimeDisplay, formatTimeDisplay, formatDateShort, diaDe } from '@/utils/fechasLocales';

const FL = 'src/utils/fechasLocales.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function igual(t: string, obtenido: unknown, esperado: unknown): void {
  ok(`${t}  ->  ${JSON.stringify(obtenido)}` +
     (obtenido === esperado ? '' : `   (se esperaba ${JSON.stringify(esperado)})`),
     obtenido === esperado);
}
const leer = (r: string): string => { try { return fuente(r).replace(/\r\n/g, '\n'); } catch { return ''; } };
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);

/** Lo que hacian los 147 sitios. Se reimplementa para comparar de verdad. */
const comoAntes = (v: any): string => new Date(v).toLocaleDateString('es-DO');
const comoAntesConHora = (v: any): string => new Date(v).toLocaleString('es-DO');

console.log('Zona horaria: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Desfase en minutos: ' + new Date().getTimezoneOffset() + '  (240 = UTC-4, que es RD)\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. dd-MM-aaaa, CON RELLENO DE CEROS');
// ─────────────────────────────────────────────────────────────────────────
igual('   2026-09-02',            formatDateDisplay('2026-09-02'), '02-09-2026');
igual('   2026-12-31',            formatDateDisplay('2026-12-31'), '31-12-2026');
igual('   2027-01-01',            formatDateDisplay('2027-01-01'), '01-01-2027');
igual('   un ISO completo',       formatDateDisplay('2026-09-02T14:30:00.000Z'), '02-09-2026');
igual('   un Date',               formatDateDisplay(new Date(2026, 8, 2, 14, 30)), '02-09-2026');
ok('   nunca quedan barras',      !['2026-09-02', '2026-12-31'].some(d => formatDateDisplay(d).includes('/')));
ok('   siempre 10 caracteres, dd-MM-aaaa',
   ['2026-01-01', '2026-09-02', '2026-12-31'].every(d => /^\d{2}-\d{2}-\d{4}$/.test(formatDateDisplay(d))));

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. EL FALLO DE LOS 61 SITIOS: una columna `date` ya no se corre un dia');
// ─────────────────────────────────────────────────────────────────────────
for (const dia of ['2026-09-02', '2026-12-31', '2027-01-01', '2027-06-30']) {
  const antes = comoAntes(dia);
  const ahora = formatDateDisplay(dia);
  const bueno = `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`;
  ok(`   ${dia}   se pintaba "${antes}"   ahora "${ahora}"`, ahora === bueno && antes !== bueno);
}
ok('   el caso peor: el 1 de enero se pintaba como 31 de diciembre del anio ANTERIOR',
   comoAntes('2027-01-01') === '31/12/2026' && formatDateDisplay('2027-01-01') === '01-01-2027');
{
  let mal = 0, malAntes = 0, total = 0;
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) {
    const dia = `2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const bueno = `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-2027`;
    total++;
    if (formatDateDisplay(dia) !== bueno) mal++;
    if (comoAntes(dia).replace(/\//g, '-') !== bueno) malAntes++;
  }
  ok(`   ${total} dias de un anio entero, ninguno mal  (mal: ${mal})`, mal === 0);
  ok(`   como se pintaba antes, fallaban los ${total}  (fallaba: ${malAntes})`, malAntes === total);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. UNA MARCA DE TIEMPO SIGUE ENSEÑANDO SU DIA LOCAL');
// ─────────────────────────────────────────────────────────────────────────
//  Esta es la mitad que no puede cambiar: los 39 sitios que reciben un
//  `createdAt` ya estaban bien y tienen que seguir diciendo lo mismo.
{
  let distintos = 0, total = 0;
  for (let d = 0; d < 365; d++) for (const h of [0, 3, 4, 5, 12, 19, 20, 23]) {
    const t = new Date(Date.UTC(2027, 0, 1 + d, h, 30));
    total++;
    const nuevo = formatDateDisplay(t);
    const viejo = comoAntes(t).split('/').map((x, i) => i < 2 ? x.padStart(2, '0') : x);
    if (nuevo !== `${viejo[0]}-${viejo[1]}-${viejo[2]}`) distintos++;
  }
  ok(`   ${total} marcas de tiempo: el DIA es el mismo que antes  (distintos: ${distintos})`, distintos === 0);
}
igual('   las 20:30 UTC son todavia el dia 1 en RD',
      formatDateDisplay(new Date('2027-01-01T20:30:00.000Z')), '01-01-2027');
igual('   las 03:30 UTC del dia 2 son todavia el dia 1 en RD',
      formatDateDisplay(new Date('2027-01-02T03:30:00.000Z')), '01-01-2027');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. LA HORA: 24 HORAS, RELLENA, SIN SEGUNDOS');
// ─────────────────────────────────────────────────────────────────────────
igual('   una marca de tiempo de la tarde',
      formatDateTimeDisplay(new Date(2026, 8, 2, 14, 5)), '02-09-2026 14:05');
igual('   una de la madrugada, con relleno',
      formatDateTimeDisplay(new Date(2026, 8, 2, 9, 7)), '02-09-2026 09:07');
igual('   medianoche es 00:00, no "12:00:00 a. m."',
      formatDateTimeDisplay(new Date(2026, 8, 2, 0, 0)), '02-09-2026 00:00');
igual('   las once de la noche son 23:00',
      formatDateTimeDisplay(new Date(2026, 8, 2, 23, 0)), '02-09-2026 23:00');
ok('   sin segundos',
   !formatDateTimeDisplay(new Date(2026, 8, 2, 14, 5, 33)).includes(':33'));
ok('   y lo de antes SI los traia',
   comoAntesConHora(new Date(2026, 8, 2, 14, 5, 33)).includes('33'));
igual('   un dia sin hora enseña solo el dia: no se inventa una medianoche',
      formatDateTimeDisplay('2026-09-02'), '02-09-2026');
igual('   un ISO completo si trae su hora',
      formatDateTimeDisplay('2026-09-02T14:05:00.000Z'), '02-09-2026 10:05');

//  La hora sola, para las pantallas que ya tienen la fecha en otra columna.
igual('   solo la hora, 24 h y rellena',   formatTimeDisplay(new Date(2026, 8, 2, 9, 7)), '09:07');
igual('   medianoche es 00:00',            formatTimeDisplay(new Date(2026, 8, 2, 0, 0)), '00:00');
igual('   las once de la noche, 23:00',    formatTimeDisplay(new Date(2026, 8, 2, 23, 0)), '23:00');
ok('   sin "a. m." ni "p. m."',
   !['00:00', '09:07', '23:00'].some(() => /m\./.test(formatTimeDisplay(new Date(2026, 8, 2, 9, 7)))));
igual('   un dia sin hora no la inventa',  formatTimeDisplay('2026-09-02'), '-');
igual('   sin nada, guion',                formatTimeDisplay(null), '-');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nE. NI SE TAPA NI SE INVENTA');
// ─────────────────────────────────────────────────────────────────────────
igual('   null',                  formatDateDisplay(null), '-');
igual('   undefined',             formatDateDisplay(undefined), '-');
igual('   cadena vacia',          formatDateDisplay(''), '-');
igual('   un Date invalido',      formatDateDisplay(new Date('vaya')), '-');
igual('   lo ilegible se enseña tal cual, no se tapa',
      formatDateDisplay('pendiente'), 'pendiente');
igual('   y con hora, igual',     formatDateTimeDisplay(null), '-');
ok('   formatDateShort sigue siendo el corto de las tarjetas',
   formatDateShort('2026-09-02') === '2 sep');
ok('   y tampoco se corre un dia',
   formatDateShort('2027-01-01') === '1 ene');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nF. EL FICHERO NO VUELVE A CONSTRUIR UN Date PARA LA FECHA');
// ─────────────────────────────────────────────────────────────────────────
const fl = leer(FL);
if (fl.length < 3000) throw new Error('No se pudo leer fechasLocales.ts. Revisa la ruta.');

ok('exporta formatDateTimeDisplay',   tiene(fl, 'export function formatDateTimeDisplay('));
ok('y formatTimeDisplay',             tiene(fl, 'export function formatTimeDisplay('));
ok('no queda ni un toLocaleDateString', !/toLocaleDateString/.test(fl));
ok('ni un toLocaleString',              !/toLocaleString/.test(fl));
ok('formatDateDisplay no construye ningun Date',
   (() => { const m = fl.match(/export function formatDateDisplay\([\s\S]{0,500}?\n\}/); return m !== null && !m[0].includes('new Date'); })());
ok('formatDateDisplay se apoya en diaDe',
   (() => { const m = fl.match(/export function formatDateDisplay\([\s\S]{0,500}?\n\}/); return m !== null && m[0].includes('diaDe('); })());
ok('la hora SI usa un Date, que es lo correcto para un instante',
   (() => { const m = fl.match(/function horaDe\([\s\S]{0,500}?\n\}/); return m !== null && m[0].includes('new Date'); })());
ok('diaDe sigue cortando la cadena en vez de interpretarla',
   diaDe('2027-01-01') === '2027-01-01');

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
