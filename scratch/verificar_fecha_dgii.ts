/**
 * Banco de comprobaciones del lote 93: un solo formateador de fecha para la DGII.
 *
 * Se corre con la zona horaria de Republica Dominicana, que es donde el fallo
 * existe:
 *
 *     TZ=America/Santo_Domingo pnpm exec tsx scratch/verificar_fecha_dgii.ts
 *
 * Lo que fija este banco, por orden de importancia:
 *
 *   A. Una fecha de una columna `date` ('AAAA-MM-DD') ya NO se corre un dia.
 *      Ese era el fallo: 336 de 336 fechas de un anio salian con un dia menos
 *      declaradas a la DGII.
 *   B. Una MARCA DE TIEMPO da exactamente lo mismo que antes. Es la mitad que
 *      de verdad importa para no romper nada: los cuatro sitios que hoy estan
 *      bien tienen que seguir dando el mismo texto. El banco reimplementa el
 *      formateador VIEJO y compara los dos, byte a byte, sobre instantes de
 *      todas las horas del dia.
 *   C. La vuelta (dd-MM-aaaa -> 'AAAA-MM-DD') rechaza las fechas que no
 *      existen en vez de normalizarlas en silencio.
 */
import { fechaDgii, fechaDgiiExigida, diaDesdeFechaDgii, esFechaDgii } from '@/services/dgii/fechaDgii';
import { vencimientoSecuencia } from '@/services/dgii/secuencia';

let ok = 0;
let mal = 0;
const fallos: string[] = [];

function comprobar(nombre: string, condicion: boolean) {
  if (condicion) { ok++; console.log('  OK    ' + nombre); }
  else { mal++; fallos.push(nombre); console.log('  FALLA ' + nombre); }
}

function igual(nombre: string, obtenido: unknown, esperado: unknown) {
  comprobar(`${nombre}  ->  ${JSON.stringify(obtenido)}` +
            (obtenido === esperado ? '' : `   (se esperaba ${JSON.stringify(esperado)})`),
            obtenido === esperado);
}

function lanza(nombre: string, fn: () => unknown) {
  try { fn(); comprobar(nombre + '  (NO lanzo)', false); }
  catch { comprobar(nombre, true); }
}

/** El formateador VIEJO, reimplementado tal cual estaba en las cinco copias. */
function formateadorViejo(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

console.log('Zona horaria del proceso: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Desfase de hoy en minutos: ' + new Date().getTimezoneOffset() + '  (240 = UTC-4, que es RD)\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL FALLO: una columna `date` llega como cadena y ya no se corre un dia');
// ─────────────────────────────────────────────────────────────────────────
igual('   31-12-2026 (fin de anio)',      fechaDgii('2026-12-31'), '31-12-2026');
igual('   30-06-2027 (fin de mes)',       fechaDgii('2027-06-30'), '30-06-2027');
igual('   01-01-2027 (el caso peor)',     fechaDgii('2027-01-01'), '01-01-2027');
igual('   01-03-2028 (tras el bisiesto)', fechaDgii('2028-03-01'), '01-03-2028');
igual('   un ISO completo se corta',      fechaDgii('2026-12-31T00:00:00.000Z'), '31-12-2026');

// El caso peor, dicho entero: el viejo declaraba una autorizacion YA VENCIDA.
igual('   el viejo daba 31-12-2026 para el 1 de enero de 2027',
      formateadorViejo(new Date('2027-01-01')), '31-12-2026');
comprobar('   el nuevo NO coincide con el viejo en una fecha sin hora  (si coincidiera, no habria arreglo)',
          fechaDgii('2027-01-01') !== formateadorViejo(new Date('2027-01-01')));

// Un anio entero, dia a dia. Era 336/336 mal; ahora tiene que ser 0.
{
  let corridas = 0;
  let total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    for (let dia = 1; dia <= 28; dia++) {
      const texto = `2027-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const esperado = `${String(dia).padStart(2, '0')}-${String(mes).padStart(2, '0')}-2027`;
      total++;
      if (fechaDgii(texto) !== esperado) corridas++;
    }
  }
  comprobar(`   ${total} fechas de un anio entero, ninguna corrida  (corridas: ${corridas})`, corridas === 0);

  // Y la contraparte: el formateador viejo las fallaba TODAS.
  let viejasMal = 0;
  for (let mes = 1; mes <= 12; mes++) {
    for (let dia = 1; dia <= 28; dia++) {
      const texto = `2027-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const esperado = `${String(dia).padStart(2, '0')}-${String(mes).padStart(2, '0')}-2027`;
      if (formateadorViejo(new Date(texto)) !== esperado) viejasMal++;
    }
  }
  comprobar(`   el formateador viejo fallaba las ${total}  (fallaba: ${viejasMal})`, viejasMal === total);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. LO QUE NO PUEDE CAMBIAR: una marca de tiempo da lo mismo que antes');
// ─────────────────────────────────────────────────────────────────────────
{
  // Instantes de todas las horas del dia, a lo largo de un anio. Estos son
  // los `createdAt` que reciben msellerClient y codigoSeguridad.
  let distintos = 0;
  let total = 0;
  const muestras: string[] = [];
  for (let d = 0; d < 365; d++) {
    for (const hora of [0, 1, 3, 4, 5, 11, 12, 19, 20, 21, 23]) {
      const t = new Date(Date.UTC(2027, 0, 1 + d, hora, 30, 0));
      total++;
      const nuevo = fechaDgii(t);
      const viejo = formateadorViejo(t);
      if (nuevo !== viejo) { distintos++; if (muestras.length < 5) muestras.push(`${t.toISOString()}: viejo=${viejo} nuevo=${nuevo}`); }
    }
  }
  comprobar(`   ${total} marcas de tiempo, el texto es identico al de antes  (distintos: ${distintos})` +
            (muestras.length ? '\n        ' + muestras.join('\n        ') : ''),
            distintos === 0);
}
igual('   una marca de tiempo de las 20:30 UTC es el dia local, no el UTC',
      fechaDgii(new Date('2027-01-01T20:30:00.000Z')), '01-01-2027');
igual('   una marca de tiempo de las 03:30 UTC es el dia ANTERIOR en RD',
      fechaDgii(new Date('2027-01-02T03:30:00.000Z')), '01-01-2027');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. AUSENCIAS: null, y no una fecha inventada');
// ─────────────────────────────────────────────────────────────────────────
igual('   null',                    fechaDgii(null), null);
igual('   undefined',               fechaDgii(undefined), null);
igual('   cadena vacia',            fechaDgii(''), null);
igual('   basura',                  fechaDgii('manana'), null);
igual('   un Date invalido',        fechaDgii(new Date('vaya')), null);
igual('   un dd-MM-aaaa no se malinterpreta como AAAA-MM-DD', fechaDgii('31-12-2026'), null);
lanza('   fechaDgiiExigida se para si no hay fecha', () => fechaDgiiExigida(null, 'FechaEmision'));
comprobar('   ...y el mensaje dice QUE campo falta',
  (() => { try { fechaDgiiExigida(null, 'FechaEmision'); return false; }
           catch (e) { return String((e as Error).message).includes('FechaEmision'); } })());
igual('   fechaDgiiExigida devuelve la fecha cuando la hay',
      fechaDgiiExigida('2026-12-31', 'FechaEmision'), '31-12-2026');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. LA VUELTA: una fecha que no existe se rechaza, no se normaliza');
// ─────────────────────────────────────────────────────────────────────────
igual('   31-12-2026 es real',              diaDesdeFechaDgii('31-12-2026'), '2026-12-31');
igual('   01-01-2027 es real',              diaDesdeFechaDgii('01-01-2027'), '2027-01-01');
igual('   32-01-2026 NO existe',            diaDesdeFechaDgii('32-01-2026'), null);
igual('   31-02-2026 NO existe',            diaDesdeFechaDgii('31-02-2026'), null);
igual('   31-04-2026 NO existe (abril tiene 30)', diaDesdeFechaDgii('31-04-2026'), null);
igual('   00-01-2026 NO existe',            diaDesdeFechaDgii('00-01-2026'), null);
igual('   01-13-2026 NO existe',            diaDesdeFechaDgii('01-13-2026'), null);
igual('   01-00-2026 NO existe',            diaDesdeFechaDgii('01-00-2026'), null);
igual('   29-02-2028 SI existe (bisiesto)', diaDesdeFechaDgii('29-02-2028'), '2028-02-29');
igual('   29-02-2027 NO existe',            diaDesdeFechaDgii('29-02-2027'), null);
igual('   29-02-2000 SI existe (regla de los 400)', diaDesdeFechaDgii('29-02-2000'), '2000-02-29');
igual('   29-02-1900 NO existe (regla de los 400)', diaDesdeFechaDgii('29-02-1900'), null);
igual('   un AAAA-MM-DD no cuela por la vuelta', diaDesdeFechaDgii('2026-12-31'), null);
igual('   sin relleno de ceros no cuela',     diaDesdeFechaDgii('1-1-2026'), null);
igual('   null',                              diaDesdeFechaDgii(null), null);
igual('   se admiten espacios alrededor',     diaDesdeFechaDgii('  31-12-2026  '), '2026-12-31');
// ...pero SOLO espacios. La expresion tiene que estar anclada de punta a
// punta: sin anclas, 'vence el 31-12-2026' pasaria, y la ruta guarda en
// `sequence_expiry` el texto TAL CUAL -- con la basura pegada -- que es
// justo el valor que viaja dentro del e-CF hasta la DGII.
igual('   un digito de mas por detras no cuela',  diaDesdeFechaDgii('31-12-20261'), null);
igual('   un digito de mas por delante no cuela', diaDesdeFechaDgii('131-12-2026'), null);
igual('   texto pegado por delante no cuela',     diaDesdeFechaDgii('vence el 31-12-2026'), null);
igual('   texto pegado por detras no cuela',      diaDesdeFechaDgii('31-12-2026 o el 01-01-2027'), null);
igual('   un salto de linea dentro no cuela',     diaDesdeFechaDgii('31-12-2026\n01-01-2027'), null);
comprobar('   esFechaDgii sigue a diaDesdeFechaDgii',
          esFechaDgii('31-12-2026') && !esFechaDgii('31-02-2026') && !esFechaDgii(null));

// Esto es lo que hacia la ruta antes, y por que era un fallo:
{
  const partes = '32-01-2026'.split('-');
  const normalizada = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  const loQueGuardaba = `${normalizada.getFullYear()}-${String(normalizada.getMonth() + 1).padStart(2, '0')}-${String(normalizada.getDate()).padStart(2, '0')}`;
  igual('   el `new Date(a,m,d)` de antes convertia el 32 de enero en',
        loQueGuardaba, '2026-02-01');
  comprobar('   ...y la ruta guardaba a la vez el texto "32-01-2026" y el dia 2026-02-01: dos columnas en desacuerdo',
            loQueGuardaba !== null && diaDesdeFechaDgii('32-01-2026') === null);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\nE. vencimientoSecuencia de punta a punta');
// ─────────────────────────────────────────────────────────────────────────
// e-31 exige la fecha; e-32, e-34 y e-47 no la llevan (la DGII: "No Aplica").
igual('   e-32 no lleva el campo, aunque haya fecha',
      vencimientoSecuencia({ expiryDate: '2026-12-31' }, '32'), null);
igual('   e-34 no lleva el campo',
      vencimientoSecuencia({ sequenceExpiry: '31-12-2026' }, '34'), null);
igual('   e-31 desde la columna `date`: EL ARREGLO',
      vencimientoSecuencia({ expiryDate: '2026-12-31' }, '31'), '31-12-2026');
igual('   e-31 que vence el 1 de enero ya no se declara vencida',
      vencimientoSecuencia({ expiryDate: '2027-01-01' }, '31'), '01-01-2027');
igual('   e-31 con el texto cargado, se respeta',
      vencimientoSecuencia({ sequenceExpiry: '30-06-2027' }, '31'), '30-06-2027');
igual('   el texto manda sobre la columna',
      vencimientoSecuencia({ sequenceExpiry: '30-06-2027', expiryDate: '2026-12-31' }, '31'), '30-06-2027');
lanza('   e-31 sin fecha ninguna se para',
      () => vencimientoSecuencia({}, '31'));
lanza('   e-31 con un texto imposible se para en vez de declararlo',
      () => vencimientoSecuencia({ sequenceExpiry: '32-13-2026' }, '31'));
lanza('   e-31 con un 31 de febrero se para',
      () => vencimientoSecuencia({ sequenceExpiry: '31-02-2026' }, '31'));
lanza('   e-31 con basura pegada a una fecha valida se para  (la ruta guarda el texto entero)',
      () => vencimientoSecuencia({ sequenceExpiry: 'vence el 31-12-2026' }, '31'));
comprobar('   ...y el mensaje trae la fecha imposible delante',
  (() => { try { vencimientoSecuencia({ sequenceExpiry: '32-13-2026' }, '31'); return false; }
           catch (e) { return String((e as Error).message).includes('32-13-2026'); } })());

// ─────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
console.log(`${ok} en OK, ${mal} en FALLA`);
if (mal > 0) { console.log('\nFALLAN:'); for (const f of fallos) console.log('  - ' + f); process.exit(1); }
console.log('Todo en orden.');
