/**
 * El vencimiento no se corre un dia.
 *
 * EL FALLO
 * --------
 * Las columnas `date` de Postgres llegan por drizzle como la cadena
 * 'AAAA-MM-DD'. Todo el modulo financiero las convertia a `Date`, y JavaScript
 * lee esa cadena como MEDIANOCHE UTC: en Republica Dominicana (UTC-4) eso es el
 * dia ANTERIOR a las 20:00. El apano habitual -- `d.setHours(0,0,0,0)` -- no lo
 * arregla, fija la medianoche del dia equivocado.
 *
 * Medido: un vencimiento guardado como 30/09 se pintaba 29/09 en pantalla, en
 * el papel y en el CSV; la factura se marcaba "Vencida" el mismo dia en que
 * vencia; y el atraso salia inflado en un dia. Los tramos de antiguedad del
 * servidor -- que son dinero en una tarjeta -- contaban igual de corrido.
 *
 * QUE COMPRUEBA ESTE BANCO
 * ------------------------
 * Ejecuta los helpers, no los describe. Son aritmetica sobre texto
 * ('AAAA-MM-DD'), asi que su resultado NO PUEDE depender del huso horario: esa
 * es toda la idea del arreglo. (Se comprobo ademas corriendo la bateria en
 * cinco zonas, de UTC+14 a UTC-11, antes de escribir esto.)
 *
 * Y comprueba que ninguno de los seis ficheros vuelve a construir un `Date` a
 * partir de un vencimiento, que es la unica forma de que el fallo vuelva.
 */
import {
  diaDe, diasEntreDias, diasDeAtraso, diasDeAntiguedad, estaVencida,
  formatDateDisplay, formatDateShort,
} from '../src/utils/fechasLocales';
import * as Fechas from '../src/utils/fechasLocales';
import { fuente } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const veces = (s: string, t: string): number => s.split(t).length - 1;

/** 'accounts-payable/ListTab.tsx'. Sin esto, los dos ListTab salen con la misma
 *  etiqueta y un fallo no dice cual de los dos es. */
const etiqueta = (ruta: string): string => {
  const p = ruta.split('/');
  return p.filter(x => x !== 'components').slice(-2).join('/');
};

const FICHEROS = [
  'src/actions/receivables.ts',
  'src/actions/payables.ts',
  'src/app/dashboard/financial/accounts-receivable/components/ListTab.tsx',
  'src/app/dashboard/financial/accounts-payable/components/ListTab.tsx',
  'src/app/dashboard/financial/accounts-receivable/components/KanbanTab.tsx',
  'src/app/dashboard/financial/accounts-payable/components/KanbanTab.tsx',
];

// ─────────────────────── lo que se ejecuta ───────────────────────

// Contra el arbol anterior estos helpers no existen, y llamarlos reventaria el
// banco entero en vez de dar FALLA. Una contraprueba que se cae no dice si
// falla por lo que crees. Con esta bandera, cada comprobacion de abajo se
// cortocircuita y sale FALLA, que es lo que tiene que pasar.
const HELPERS = ['diaDe', 'diasEntreDias', 'diasDeAtraso', 'diasDeAntiguedad', 'estaVencida', 'formatDateShort'];
const hay = HELPERS.every(n => typeof (Fechas as Record<string, unknown>)[n] === 'function');

ok(`existen los ${HELPERS.length} helpers de fecha local`, hay);

// Las tres formas en que una fecha llega hasta aqui: la cadena de una columna
// `date` (CxC), un ISO completo (como mandaba CxP) y una marca de tiempo real.
ok('diaDe lee las tres formas y devuelve siempre el mismo dia',
  hay && diaDe('2026-09-30') === '2026-09-30'
  && diaDe('2026-09-30T00:00:00.000Z') === '2026-09-30'
  && diaDe(new Date(2026, 8, 30, 15, 0)) === '2026-09-30');

// Sin esto, una fila sin fecha se convertiria en el 31/12/1969.
ok('diaDe devuelve null ante lo que no es una fecha',
  hay && diaDe(null) === null && diaDe('') === null
  && diaDe('no es fecha') === null && diaDe(new Date('x')) === null);

// EL FALLO, EN UNA LINEA: el dia en que algo vence todavia no esta vencido.
ok('el dia del vencimiento no cuenta como atraso',
  hay && diasDeAtraso('2026-09-30', '2026-09-30') === 0
  && estaVencida('2026-09-30', '2026-09-30') === false
  && diasDeAtraso('2026-09-30', '2026-10-01') === 1
  && estaVencida('2026-09-30', '2026-10-01') === true);

ok('antes de vencer, el atraso es cero y no negativo',
  hay && diasDeAtraso('2026-09-30', '2026-09-23') === 0);

ok('las cuentas cruzan meses, anos y bisiestos',
  hay && diasEntreDias('2026-09-30', '2026-12-31') === 92
  && diasEntreDias('2026-12-31', '2027-01-01') === 1
  && diasEntreDias('2028-02-28', '2028-03-01') === 2
  && diasEntreDias('2026-02-28', '2026-03-01') === 1);

// Antiguedad y atraso no son lo mismo, y confundirlos infla el atraso en todo
// el plazo de credito. La tabla de CxC las confundia.
ok('antiguedad y atraso son cosas distintas',
  hay && diasDeAntiguedad('2026-06-14', '2026-09-12') === 90
  && diasDeAtraso('2026-07-14', '2026-09-12') === 60);

ok('las dos formas de pintar una fecha salen del mismo dia',
  hay && formatDateDisplay('2026-09-30') === '30/09/2026'
  && formatDateShort('2026-09-30') === '30 sep'
  && formatDateShort('2026-09-30T00:00:00.000Z') === '30 sep'
  && formatDateShort(null) === '-');

// ─────────────────────── lo que se lee ───────────────────────

for (const ruta of FICHEROS) {
  const src = fuente(ruta).replace(/\r\n/g, '\n');
  const corto = etiqueta(ruta);

  // La unica forma de que el fallo vuelva.
  ok(`${corto}: no construye un Date a partir de un vencimiento`,
    !/new Date\([^)]*dueDate/.test(src));

  ok(`${corto}: usa los helpers de fecha local`,
    src.includes("from '@/utils/fechasLocales'"));
}

// `setHours(0,0,0,0)` sobre una MARCA DE TIEMPO (un `createdAt`) es correcto y
// sigue ahi a proposito. Lo que no puede quedar es sobre un vencimiento -- ya
// cubierto arriba --, asi que aqui solo se fija que no reaparezca en los sitios
// donde no queda ninguno.
for (const ruta of FICHEROS.slice(0, 2).concat(FICHEROS.slice(4))) {
  const src = fuente(ruta).replace(/\r\n/g, '\n');
  ok(`${etiqueta(ruta)}: ya no fija medianoche a mano`,
    !src.includes('setHours(0,0,0,0)'));
}

// La asimetria entre gemelas: su gemela de cobrar nunca sumo saldos negativos.
{
  const ap = fuente('src/actions/payables.ts').replace(/\r\n/g, '\n');
  ok('payables: el total por pagar ya no suma los saldos a favor',
    /if \(item\.balance <= 0\) return;\s*totalPorPagar \+= item\.balance;/.test(ap));
}

// El cuerpo que viaja al navegador lleva el dia, no un ISO que haya que volver
// a interpretar -- que era donde se perdia.
{
  const ap = fuente('src/actions/payables.ts').replace(/\r\n/g, '\n');
  ok('payables: manda el dia tal cual, sin pasarlo por ISO',
    ap.includes("dueDate: diaDe(ap.dueDate) ?? ''")
    && !ap.includes('new Date(ap.dueDate).toISOString()'));
}

// La tarjeta del kanban tenia su propio formateo con toLocaleDateString.
for (const ruta of FICHEROS.slice(4)) {
  const src = fuente(ruta).replace(/\r\n/g, '\n');
  ok(`${etiqueta(ruta)}: la tarjeta usa el formato compartido`,
    src.includes('formatDateShort(item.dueDate)')
    && veces(src, 'toLocaleDateString') === 0);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
