/**
 * La fecha de vencimiento de la secuencia e-CF no se inventa.
 *
 * EL FALLO
 * --------
 * `let sequenceExpiry = '31-12-2026';` escrito a pelo en DOS sitios: la
 * emision y el envio en diferido. Si la secuencia no traia fecha, esa se
 * declaraba a la DGII como `FechaVencimientoSecuencia`, dentro del
 * comprobante.
 *
 * Encontrado en datos reales: las secuencias e-32 y e-34 de produccion de la
 * empresa que factura estaban SIN fecha, y 27 comprobantes e-32 salieron
 * declarando el 31-12-2026. Se salvaron porque iban al ambiente de pruebas.
 *
 * Y la fecha caducaba sola: pasado el 31-12-2026 cada comprobante habria
 * declarado una autorizacion vencida sin que nadie lo notara.
 */
import { vencimientoSecuencia } from '../src/services/dgii/secuencia';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const lanza = (fn: () => unknown): string | null => {
  try { fn(); return null; } catch (e: any) { return e.message; }
};

console.log('\n1) Cuando la fecha consta, se usa tal cual\n');

ok('la fecha explicita se devuelve sin tocar',
  vencimientoSecuencia({ sequenceExpiry: '31-12-2027' }, '31') === '31-12-2027');
ok('espacios alrededor no la invalidan',
  vencimientoSecuencia({ sequenceExpiry: '  31-12-2027  ' }, '31') === '31-12-2027');
ok('si solo hay expiryDate, se formatea dd-MM-aaaa con ceros',
  vencimientoSecuencia({ expiryDate: new Date('2027-03-05T00:00:00') }, '31') === '05-03-2027',
  vencimientoSecuencia({ expiryDate: new Date('2027-03-05T00:00:00') }, '31'));
ok('la explicita manda sobre expiryDate',
  vencimientoSecuencia({ sequenceExpiry: '31-12-2027', expiryDate: new Date('2030-01-01') }, '31')
    === '31-12-2027');

console.log('\n2) Cuando NO consta, se para -- no se inventa\n');

// El caso real: sequence_expiry = '' (cadena vacia) y expiry_date NULL.
ok('cadena vacia -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: '' }, '32')) !== null);
ok('solo espacios -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: '   ' }, '32')) !== null);
ok('nulo -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: null }, '32')) !== null);
ok('sin secuencia -> lanza', lanza(() => vencimientoSecuencia(null, '32')) !== null);
ok('fecha ilegible -> lanza',
  lanza(() => vencimientoSecuencia({ expiryDate: 'no es una fecha' }, '32')) !== null);

const msg = lanza(() => vencimientoSecuencia({ sequenceExpiry: '' }, '32')) || '';
ok('el mensaje dice QUE tipo de comprobante es', msg.includes('e-32'), msg.slice(0, 60));
ok('y dice que hacer', /Ajustes/.test(msg) && /autorizacion/i.test(msg));
ok('y NUNCA menciona una fecha inventada', !/\d{2}-\d{2}-\d{4}/.test(msg), msg);

console.log('\n3) Ningun sitio vuelve a poner la fecha a pelo\n');

for (const f of ['src/services/invoice/invoiceSubmissionService.ts',
                 'src/infrastructure/jobRunners.ts']) {
  const src = fuente(f);
  ok(`${f.split('/').pop()}: sin fecha fija`,
    !/sequenceExpiry\s*=\s*'\d{2}-\d{2}-\d{4}'/.test(src));
  ok(`${f.split('/').pop()}: la pide a vencimientoSecuencia`,
    /vencimientoSecuencia\(/.test(src));
}

// La duplicacion era la causa de que el valor fijo sobreviviera: se arreglaba
// en un fichero y el otro seguia igual. Que haya UNA implementacion es parte
// del arreglo, no un detalle de estilo.
const helper = fuente('src/services/dgii/secuencia.ts');
ok('la logica vive en un solo modulo', /export function vencimientoSecuencia/.test(helper));
ok('y ese modulo no tiene valor por defecto',
  !/return\s+'\d{2}-\d{2}-\d{4}'/.test(helper));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
