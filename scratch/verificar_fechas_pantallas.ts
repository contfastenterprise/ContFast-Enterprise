/**
 * Banco de la capa 2 del barrido de fechas: las PANTALLAS.
 *
 *     pnpm exec tsx scratch/verificar_fechas_pantallas.ts
 *
 * Capa 1 (lote 96) dejo los formateadores. Esta capa hace que las pantallas
 * los usen: 105 sitios en 37 ficheros de `app/` y `components/`.
 *
 * POR QUE SE COMPRUEBA SOBRE EL FUENTE Y NO EJECUTANDO
 * ---------------------------------------------------
 * Son paginas de React con estado, framer-motion y peticiones. Montarlas
 * desde un banco significaria arrastrar media aplicacion, y lo que hay que
 * fijar no es lo que pintan sino DE DONDE sacan la fecha. El comportamiento
 * del formateador ya se ejecuta de verdad en `verificar_fecha_visible.ts`;
 * aqui se comprueba que nadie se lo salte.
 *
 * LA TRAMPA QUE HAY QUE EVITAR
 * ----------------------------
 * `x.toLocaleString('es-DO')` es una FECHA cuando `x` es un `Date` y un
 * IMPORTE cuando es un numero. En esta aplicacion hay 23 sitios del segundo
 * tipo -- salarios, cantidades, totales en RD$ -- y confundirlos con fechas
 * seria romper los importes de la nomina. Por eso el banco no solo cuenta lo
 * que se convirtio: comprueba tambien que esos 23 SIGAN ESTANDO.
 */
import fs from 'fs';
import path from 'path';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const RAICES = ['src/app', 'src/components'];
/** `src/app/api/**` alimenta las plantillas: es capa 3, no pantalla. */
const ES_CAPA3 = (p: string): boolean => p.startsWith('src/app/api/');
/**
 * La localizacion interna de react-day-picker: los nombres de los meses y de
 * los dias que pinta el propio control. No es un dato del negocio y tocarlo
 * romperia el idioma del calendario.
 */
const EXCLUIDO = (p: string): boolean => p.endsWith('components/ui/calendar.tsx');

function ficheros(): string[] {
  const out: string[] = [];
  const andar = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) andar(p);
      else if (/\.(ts|tsx)$/.test(p) && !ES_CAPA3(p) && !EXCLUIDO(p)) out.push(p);
    }
  };
  for (const r of RAICES) if (fs.existsSync(r)) andar(r);
  return out.sort();
}

const TODOS = ficheros();
//  Precondicion: sin ficheros, todas las negaciones de abajo son ciertas
//  gratis y el banco daria verde sin mirar nada.
if (TODOS.length < 100) {
  throw new Error(`Solo se encontraron ${TODOS.length} ficheros en app/ y components/. Revisa desde donde se corre.`);
}

/**
 * QUE DISTINGUE UNA FECHA DE UN IMPORTE
 *
 * `toLocaleDateString` y `toLocaleTimeString` son siempre fechas. El
 * ambiguo es `toLocaleString`, que sirve para las dos cosas:
 *
 *     new Date(x).toLocaleString('es-DO')        -> una FECHA con hora
 *     parseFloat(x).toLocaleString('es-DO')      -> un IMPORTE con miles
 *
 * Lo que decide es el RECEPTOR, no las opciones. La primera version de este
 * banco miraba las opciones -- daba por importe solo lo que llevaba
 * `minimumFractionDigits` -- y por eso llamaba fecha a los 23 salarios y
 * totales en RD$ de la nomina: habria exigido convertirlos y habria roto los
 * separadores de miles.
 */
const LLAMADA = /(new\s+Date\s*\([^()]*\)|[\w$.\]\[]+)\.toLocale(Date|Time)?String\(([^)]*(?:\{[^}]*\})?[^)]*)\)/g;

interface Sitio { fichero: string; linea: number; texto: string; clase: 'fecha' | 'numero' }
const sitios: Sitio[] = [];
for (const f of TODOS) {
  const lineas = fs.readFileSync(f, 'utf8').split('\n');
  lineas.forEach((l, i) => {
    for (const m of l.matchAll(LLAMADA)) {
      const receptor = m[1];
      const tipo = m[2];
      const esFecha = tipo === 'Date' || tipo === 'Time' || /^new\s+Date\s*\(/.test(receptor);
      sitios.push({ fichero: f, linea: i + 1, texto: l.trim().slice(0, 90), clase: esFecha ? 'fecha' : 'numero' });
    }
  });
}
const fechas = sitios.filter(s => s.clase === 'fecha');
const numeros = sitios.filter(s => s.clase === 'numero');

/**
 * Los ficheros que ya pasan por un formateador compartido.
 *
 * Casi todo lo que hay debajo va atado a este numero, y no por capricho: la
 * mitad de las comprobaciones de este banco son NEGACIONES ("no queda
 * ningun...", "nadie hace tal"), y antes del barrido eran ciertas gratis
 * porque no existia ningun formateador al que pegarle un apaño. La
 * contraprueba -- correr este mismo banco contra los fuentes sin tocar --
 * las cazo saliendo en OK, que es la senal de que no comprobaban nada.
 */
const usan = TODOS.filter(f => /format(Date|DateTime|Time)Display\s*\(/.test(fs.readFileSync(f, 'utf8')));
const SE_BARRIO = usan.length >= 30;

console.log(`Revisados ${TODOS.length} ficheros de app/ y components/\n`);

// ─────────────────────────────────────────────────────────────────────────
console.log('A. NINGUNA PANTALLA FORMATEA FECHAS POR SU CUENTA');
// ─────────────────────────────────────────────────────────────────────────
ok(`no queda ni un toLocaleDateString / toLocaleTimeString / toLocaleString de fecha  (quedan: ${fechas.length})`,
   fechas.length === 0);
if (fechas.length) for (const s of fechas.slice(0, 12)) console.log(`        ${s.fichero}:${s.linea}  ${s.texto}`);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. PERO LOS IMPORTES SIGUEN INTACTOS');
// ─────────────────────────────────────────────────────────────────────────
//  Si alguien "terminara el barrido" convirtiendo tambien estos, los salarios
//  y los totales en RD$ dejarian de llevar separador de miles.
//
//  Estas dos NO se pueden escribir como "quedan importes sin tocar" a secas:
//  eso era cierto ANTES del barrido tambien, y una comprobacion que sale OK
//  en la contraprueba no comprueba nada. Van atadas a los ficheros que SI se
//  convirtieron: en ellos tiene que haber las dos cosas a la vez.
const MEZCLADOS = [
  'src/app/dashboard/hr/payroll/page.tsx',     // 9 fechas, 12 importes
  'src/app/dashboard/purchases/page.tsx',      // fechas y 12 importes
  'src/app/dashboard/inventory/movements/page.tsx',
  'src/app/dashboard/quotes/page.tsx',
];
//  Precondicion: si alguno dejara de tener importes, la comprobacion de abajo
//  se cumpliria por vacio.
for (const f of MEZCLADOS) {
  if (!fs.existsSync(f)) throw new Error(`No existe ${f}: la lista de ficheros mezclados quedo obsoleta.`);
  if (!/toLocaleString/.test(fs.readFileSync(f, 'utf8'))) {
    throw new Error(`${f} ya no tiene ningun toLocaleString de importe: revisa la lista.`);
  }
}
ok(`los ${MEZCLADOS.length} ficheros que mezclan fechas e importes convirtieron SOLO las fechas`,
   MEZCLADOS.every(f => {
     const t = fs.readFileSync(f, 'utf8');
     return /format(Date|DateTime|Time)Display\s*\(/.test(t) && /toLocaleString\s*\(/.test(t);
   }));
ok(`ningun importe acabo pasando por un formateador de fecha  (importes: ${numeros.length})`,
   SE_BARRIO && numeros.length >= 20 && numeros.every(s => !/format(Date|DateTime|Time)Display/.test(s.texto)));

//  Lo anterior mira los `toLocaleString` que QUEDAN. No basta: si alguien
//  convirtiera un salario, esa linea dejaria de ser un `toLocaleString` y se
//  saldria del recuento sin que nadie se enterara. Un mutante que hacia justo
//  eso -- `formatDateDisplay(d.netSalary)` -- escapaba.
//
//  Asi que se mira por el otro lado: que le entra al formateador. Un
//  `parseFloat`, un `Number(` o un campo que huela a dinero ahi dentro es
//  siempre un error, porque una fecha no se construye asi.
const DINERO = /parseFloat\s*\(|\bNumber\s*\(|salary|amount|price|total|balance|monto|importe|saldo|subtotal|cost/i;
const conDinero: string[] = [];
for (const f of usan) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/format(?:Date|DateTime|Time)Display\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
    if (DINERO.test(m[1])) conDinero.push(`${f}  ->  ${m[0].slice(0, 60)}`);
  }
}
ok(`ningun formateador de fecha recibe algo que huela a dinero  (sospechosos: ${conDinero.length})`,
   SE_BARRIO && conDinero.length === 0);
if (conDinero.length) for (const c of conDinero.slice(0, 8)) console.log(`        ${c}`);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. LAS PANTALLAS USAN LOS FORMATEADORES COMPARTIDOS');
// ─────────────────────────────────────────────────────────────────────────
ok(`${usan.length} ficheros llaman a un formateador compartido`, SE_BARRIO);
const sinImport = usan.filter(f => !/from\s*['"]@\/utils\/fechasLocales['"]/.test(fs.readFileSync(f, 'utf8')));
ok(`todos lo importan  (sin import: ${sinImport.length})`, SE_BARRIO && sinImport.length === 0);
if (sinImport.length) for (const f of sinImport) console.log(`        ${f}`);

//  Un import duplicado del mismo modulo compila, pero es el rastro de que
//  alguien anadio una linea en vez de fusionar la que ya estaba.
const duplicados = usan.filter(f =>
  (fs.readFileSync(f, 'utf8').match(/from\s*['"]@\/utils\/fechasLocales['"]/g) ?? []).length > 1);
ok(`ninguno lo importa dos veces  (duplicados: ${duplicados.length})`, SE_BARRIO && duplicados.length === 0);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. LOS APAÑOS VIEJOS YA NO HACEN FALTA');
// ─────────────────────────────────────────────────────────────────────────
//  `x + 'T00:00:00'` se ponia para que `new Date` leyera medianoche LOCAL en
//  vez de UTC y no se corriera el dia. Con `diaDe`, que corta los diez
//  primeros caracteres, no hace nada: solo deja preguntandose por que esta.
//  Otra vez: "no queda ningun apaño" era cierto antes, cuando no habia
//  formateadores a los que pegarselo. Se ata a los tres ficheros que lo
//  tenian: tienen que usar el formateador Y haberse quedado sin el apaño.
const TENIAN_APANO = [
  'src/app/dashboard/financial/customers/page.tsx',
  'src/app/dashboard/financial/suppliers/page.tsx',
  'src/app/dashboard/delivery-notes/page.tsx',
];
for (const f of TENIAN_APANO) {
  if (!fs.existsSync(f)) throw new Error(`No existe ${f}: la lista de apaños quedo obsoleta.`);
}
ok(`los ${TENIAN_APANO.length} ficheros que lo tenian usan el formateador y ya no lo llevan`,
   TENIAN_APANO.every(f => {
     const t = fs.readFileSync(f, 'utf8');
     return /format(Date|DateTime|Time)Display\s*\(/.test(t) && !/T00:00:00/.test(t);
   }));
const conApano = TODOS.filter(f => /Display\([^)]*T00:00:00/.test(fs.readFileSync(f, 'utf8')));
ok(`y no aparecio en ningun otro  (quedan: ${conApano.length})`, SE_BARRIO && conApano.length === 0);
if (conApano.length) for (const f of conApano) console.log(`        ${f}`);

//  Y nadie toca el resultado despues: si alguien lo partiera por comas o le
//  quitara caracteres, estaria reconstruyendo un formato a mano otra vez.
const manipulan = TODOS.filter(f =>
  /format(Date|DateTime|Time)Display\([^)]*\)\s*\.(split|replace|slice|substring|padStart)/.test(fs.readFileSync(f, 'utf8')));
ok(`de los ${usan.length} que usan el formateador, ninguno recorta ni parte el resultado  (lo hacen: ${manipulan.length})`,
   SE_BARRIO && manipulan.length === 0);
if (manipulan.length) for (const f of manipulan) console.log(`        ${f}`);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nE. UNAS CUANTAS PANTALLAS, UNA A UNA');
// ─────────────────────────────────────────────────────────────────────────
const tiene = (f: string, t: string): boolean =>
  fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(t);

ok('CxC: el vencimiento de la factura',
   tiene('src/app/dashboard/receivables/page.tsx', 'formatDateDisplay(inv.dueDate)'));
ok('nomina: el periodo y la fecha de pago',
   tiene('src/app/dashboard/hr/payroll/page.tsx', 'formatDateDisplay(pr.periodStart)')
   && tiene('src/app/dashboard/hr/payroll/page.tsx', 'formatDateDisplay(pr.paymentDate)'));
ok('caja: la hora de apertura, sin fecha al lado',
   tiene('src/app/dashboard/cash/page.tsx', 'formatTimeDisplay(session.createdAt)'));
ok('caja: el historial, con fecha y hora',
   tiene('src/app/dashboard/cash/page.tsx', 'formatDateTimeDisplay(h.createdAt)'));
ok('vacaciones: fuera el timeZone: UTC, que era otro apaño',
   tiene('src/app/dashboard/hr/vacations/page.tsx', 'formatDateDisplay(v)')
   && !tiene('src/app/dashboard/hr/vacations/page.tsx', "timeZone: 'UTC'"));
ok('estado de cuenta: la ultima compra, sin el apaño',
   tiene('src/app/dashboard/financial/customers/page.tsx', 'formatDateDisplay(statementData.summary.lastPurchaseDate)'));
ok('nomina: las fechas convertidas y los salarios intactos, en el mismo fichero',
   tiene('src/app/dashboard/hr/payroll/page.tsx', 'formatDateDisplay(pr.createdAt)')
   && tiene('src/app/dashboard/hr/payroll/page.tsx', "parseFloat(d.netSalary).toLocaleString('es-DO')"));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
