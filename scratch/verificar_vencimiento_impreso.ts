/**
 * Banco del lote 95: la fecha de vencimiento que se IMPRIME.
 *
 *     TZ=America/Santo_Domingo pnpm exec tsx scratch/verificar_vencimiento_impreso.ts
 *
 * EL FALLO
 * --------
 * TRES sitios -- el correo al cliente, la ruta de imprimir y la de PDF --
 * tenian cada uno su copia de la regla de `secuencia.ts`, escrita a mano:
 *
 *     sequence?.sequenceExpiry
 *       || (sequence?.expiryDate
 *             ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-')
 *             : null)
 *
 * Tres fallos en una linea, repetida tres veces:
 *
 *   1. `new Date` sobre `expiry_date`, que es una columna `date` y llega como
 *      la cadena 'AAAA-MM-DD'. Medianoche UTC son las 20:00 del dia ANTERIOR
 *      en Republica Dominicana: un dia menos, impreso en el papel del cliente
 *      bajo el rotulo "Fecha Vencimiento".
 *
 *   2. `toLocaleDateString('es-DO')` NO rellena con ceros -- da "1/9/2026" --
 *      asi que el `.replace(/\//g, '-')` producia "1-9-2026", que no es
 *      dd-MM-aaaa y no es lo que la DGII usa en ninguna parte.
 *
 *   3. El texto guardado no se comprobaba contra el calendario, a diferencia
 *      de lo que ya hacia la emision desde el lote 93.
 *
 * POR QUE HAY DOS FUNCIONES Y NO UNA
 * ----------------------------------
 * Emitir e imprimir no son lo mismo. `vencimientoSecuencia` SE PARA cuando
 * falta el dato: el comprobante todavia no existe y pararse es reparable.
 * `vencimientoSecuenciaSiConsta` devuelve `null`: el comprobante YA existe y
 * YA se declaro, y negarse a imprimirlo no arregla nada -- solo deja al
 * cliente sin su papel. La plantilla omite la linea cuando es null.
 *
 * Si alguien unificara las dos en la que lanza, un e-31 sin fecha dejaria de
 * poder imprimirse Y de poder mandarse por correo. Eso lo fija el banco.
 */
import { fuente } from './_fuente';
import { vencimientoSecuencia, vencimientoSecuenciaSiConsta } from '@/services/dgii/secuencia';

const CF = 'src/services/invoice/correoFactura.ts';
const PR = 'src/app/api/v1/invoices/[id]/print/route.ts';
const PD = 'src/app/api/v1/invoices/[id]/pdf/route.ts';
const SE = 'src/services/dgii/secuencia.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const leer = (r: string): string => { try { return fuente(r).replace(/\r\n/g, '\n'); } catch { return ''; } };
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);
function igual(t: string, obtenido: unknown, esperado: unknown): void {
  ok(`${t}  ->  ${JSON.stringify(obtenido)}` +
     (obtenido === esperado ? '' : `   (se esperaba ${JSON.stringify(esperado)})`),
     obtenido === esperado);
}
function lanza(t: string, fn: () => unknown): void {
  try { fn(); ok(t + '  (NO lanzo)', false); } catch { ok(t, true); }
}

/**
 * `vencimientoSecuenciaSiConsta` con red.
 *
 * Toda esta seccion la llama en bucle, y si alguien la hiciera LANZAR -- que
 * es el error mas probable al tocar este fichero, porque su gemela lanza -- el
 * banco moriria en la primera vuelta sin imprimir una linea. Una comprobacion
 * que revienta no comprueba: hay que verla en FALLA.
 */
const LANZO = Symbol('lanzo');
const siConsta = (seq: any, tipo: string): string | null | symbol => {
  try { return vencimientoSecuenciaSiConsta(seq, tipo); } catch { return LANZO; }
};

/** La copia escrita a mano que habia en los tres sitios. Se reimplementa para comparar. */
const copiaVieja = (seq: any): string | null =>
  seq?.sequenceExpiry
    || (seq?.expiryDate ? new Date(seq.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : null);

console.log('Zona horaria: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Desfase en minutos: ' + new Date().getTimezoneOffset() + '  (240 = UTC-4, que es RD)\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL FALLO, LADO A LADO CON LO QUE HABIA');
// ─────────────────────────────────────────────────────────────────────────
for (const dia of ['2026-12-31', '2027-06-30', '2027-01-01', '2026-09-02']) {
  const antes = copiaVieja({ expiryDate: dia });
  const ahora = siConsta({ expiryDate: dia }, '31');
  const bueno = `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`;
  ok(`${dia}   se imprimia "${antes}"   ahora "${ahora}"   (correcto: ${bueno})`,
     ahora === bueno && antes !== bueno);
}
ok('el caso peor: una secuencia que vence el 1 de enero se imprimia como del 31 de diciembre ANTERIOR',
   copiaVieja({ expiryDate: '2027-01-01' }) === '31-12-2026'
   && siConsta({ expiryDate: '2027-01-01' }, '31') === '01-01-2027');
ok('y sin relleno de ceros: el 2 de septiembre salia "1-9-2026", que no es dd-MM-aaaa',
   copiaVieja({ expiryDate: '2026-09-02' }) === '1-9-2026');

// Un anio entero.
{
  let mal = 0, total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    for (let d = 1; d <= 28; d++) {
      const dia = `2027-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const bueno = `${String(d).padStart(2, '0')}-${String(mes).padStart(2, '0')}-2027`;
      total++;
      if (siConsta({ expiryDate: dia }, '31') !== bueno) mal++;
    }
  }
  ok(`${total} fechas de un anio entero, ninguna mal  (mal: ${mal})`, mal === 0);
  let malAntes = 0;
  for (let mes = 1; mes <= 12; mes++) {
    for (let d = 1; d <= 28; d++) {
      const dia = `2027-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const bueno = `${String(d).padStart(2, '0')}-${String(mes).padStart(2, '0')}-2027`;
      if (copiaVieja({ expiryDate: dia }) !== bueno) malAntes++;
    }
  }
  ok(`la copia vieja las fallaba las ${total}  (fallaba: ${malAntes})`, malAntes === total);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. EL TIPO DE COMPROBANTE MANDA');
// ─────────────────────────────────────────────────────────────────────────
igual('   e-32 (Consumo) no lleva el campo, aunque haya texto',
      siConsta({ sequenceExpiry: '31-12-2027' }, '32'), null);
igual('   e-34 (Nota de Credito) tampoco',
      siConsta({ expiryDate: '2027-12-31' }, '34'), null);
igual('   e-47 tampoco',
      siConsta({ sequenceExpiry: '31-12-2027' }, '47'), null);
igual('   e-31 (Credito Fiscal) si',
      siConsta({ sequenceExpiry: '31-12-2027' }, '31'), '31-12-2027');
igual('   e-44 tambien',
      siConsta({ sequenceExpiry: '31-12-2028' }, '44'), '31-12-2028');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. LO QUE NO CONSTA SE CALLA, NO SE INVENTA');
// ─────────────────────────────────────────────────────────────────────────
igual('   sin nada, null (la plantilla omite la linea)',
      siConsta({}, '31'), null);
igual('   sin la fila entera, null',
      siConsta(null, '31'), null);
igual('   un texto que no es una fecha real, null',
      siConsta({ sequenceExpiry: '31-02-2026' }, '31'), null);
igual('   un mes 13, null',
      siConsta({ sequenceExpiry: '32-13-2026' }, '31'), null);
igual('   basura pegada a una fecha valida, null',
      siConsta({ sequenceExpiry: 'vence el 31-12-2026' }, '31'), null);
igual('   el texto manda sobre la columna',
      siConsta({ sequenceExpiry: '30-06-2027', expiryDate: '2026-12-31' }, '31'), '30-06-2027');

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. IMPRIMIR NO SE PARA; EMITIR SI');
// ─────────────────────────────────────────────────────────────────────────
//  Esta es la separacion que hace util el lote. Si alguien unificara las dos
//  funciones en la que lanza, un e-31 sin fecha dejaria de poder imprimirse y
//  de poder mandarse por correo -- un comprobante que YA existe y YA se
//  declaro a la DGII.
ok('imprimir un e-31 sin fecha devuelve null en vez de LANZAR',
   siConsta({}, '31') === null);
ok('...y tampoco lanza con una fecha imposible ni con un e-32',
   siConsta({ sequenceExpiry: '31-02-2026' }, '31') === null && siConsta({}, '32') === null);
lanza('pero EMITIRLO se para', () => vencimientoSecuencia({}, '31'));
lanza('y con un texto imposible tambien', () => vencimientoSecuencia({ sequenceExpiry: '31-02-2026' }, '31'));
ok('el mensaje de "no existe" trae la fecha imposible delante',
  (() => { try { vencimientoSecuencia({ sequenceExpiry: '32-13-2026' }, '31'); return false; }
           catch (e) { return String((e as Error).message).includes('32-13-2026'); } })());
ok('y el de "no configurada" NO la trae, porque no hay ninguna',
  (() => { try { vencimientoSecuencia({}, '31'); return false; }
           catch (e) { return String((e as Error).message).includes('no tiene fecha de vencimiento configurada'); } })());
igual('emitir un e-32 sigue devolviendo null, no lanza',
      vencimientoSecuencia({}, '32'), null);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nE. LOS TRES SITIOS USAN LA REGLA, NO UNA COPIA');
// ─────────────────────────────────────────────────────────────────────────
const cf = leer(CF), pr = leer(PR), pd = leer(PD), se = leer(SE);
if (cf.length < 5000 || pr.length < 5000 || pd.length < 5000 || se.length < 2000) {
  throw new Error('No se pudieron leer los fuentes. Revisa las rutas antes de creerte nada.');
}

ok('el correo al cliente la usa',      tiene(cf, 'vencimientoSecuenciaSiConsta(sequence, invoice.ecfType)'));
ok('la ruta de imprimir la usa',       tiene(pr, 'vencimientoSecuenciaSiConsta(sequence, invoiceRecordDb.ecfType)'));
ok('la ruta del PDF la usa',           tiene(pd, 'vencimientoSecuenciaSiConsta(sequence, invoice.ecfType)'));
ok('y los tres la importan de secuencia.ts',
   [cf, pr, pd].every(s => s.includes("from '@/services/dgii/secuencia'")));

ok('no queda NINGUNA copia escrita a mano',
   [cf, pr, pd].every(s => !/toLocaleDateString\('es-DO'\)\.replace/.test(s)));
ok('ni ningun new Date sobre la fecha de la secuencia',
   [cf, pr, pd].every(s => !/new Date\(sequence/.test(s)));
ok('ni el valor fijo que se inventaba antes',
   [cf, pr, pd].every(s => !s.includes('31-12-2027') && !s.includes('31-12-2026')));

ok('secuencia.ts exporta las dos, y la de imprimir no lanza',
   tiene(se, 'export function vencimientoSecuenciaSiConsta(')
   && tiene(se, 'export function vencimientoSecuencia(')
   && !/export function vencimientoSecuenciaSiConsta\([\s\S]{0,600}?throw/.test(se));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
