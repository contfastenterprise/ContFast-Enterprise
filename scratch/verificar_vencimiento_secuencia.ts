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
 *
 * EL ARREGLO SE PASO DE FRENADA, Y ESO TAMBIEN SE MIDE AQUI
 * ---------------------------------------------------------
 * La primera correccion lanzaba en cuanto faltaba la fecha, SIN MIRAR EL TIPO.
 * Pero la DGII marca `FechaVencimientoSecuencia` como **No Aplica** en el e-32,
 * el e-34 y el e-47: ahi no tener fecha es lo correcto.
 *
 * O sea que el arreglo habria impedido emitir la factura de consumo -- el tipo
 * mas comun del sistema -- por exigir un dato que su formato no admite. Lo
 * detecto el cliente, no este banco. Por eso la seccion 4 existe.
 *
 * Fuente: DGII, "Formato Comprobante Fiscal Electronico (e-CF) v1.0", IdDoc
 * campo 4; y los ejemplos de mSeller, que omiten el campo en el 32 y el 34.
 */
import { vencimientoSecuencia } from '../src/services/dgii/secuencia';
import { exigeVencimientoSecuencia } from '../src/services/dgii/tiposComprobante';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const lanza = (fn: () => unknown): string | null => {
  try { fn(); return null; } catch (e: any) { return e.message; }
};

/** El valor, o el texto del error si lanzo. Nunca revienta el banco. */
const sinLanzar = <T,>(fn: () => T): T | string => {
  try { return fn(); } catch (e: any) { return `LANZO: ${e.message}`; }
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

console.log('\n2) En los tipos QUE LA LLEVAN, si no consta se para -- no se inventa\n');

// Se comprueba con el e-31, que si exige la fecha. La version anterior de este
// banco usaba el e-32 aqui, que es precisamente el que NO la lleva: el banco
// daba verde sobre un ejemplo equivocado.
ok('cadena vacia -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: '' }, '31')) !== null);
ok('solo espacios -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: '   ' }, '31')) !== null);
ok('nulo -> lanza', lanza(() => vencimientoSecuencia({ sequenceExpiry: null }, '31')) !== null);
ok('sin secuencia -> lanza', lanza(() => vencimientoSecuencia(null, '31')) !== null);
ok('fecha ilegible -> lanza',
  lanza(() => vencimientoSecuencia({ expiryDate: 'no es una fecha' }, '31')) !== null);

const msg = lanza(() => vencimientoSecuencia({ sequenceExpiry: '' }, '31')) || '';
ok('el mensaje dice QUE tipo de comprobante es', msg.includes('e-31'), msg.slice(0, 60));
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

console.log('\n4) Los tipos donde el campo NO APLICA no se bloquean ni lo envian\n');

// La DGII: `FechaVencimientoSecuencia` es No Aplica en el e-32, el e-34 y el
// e-47. Exigirla ahi impide emitir; mandarla es mandar un campo que su
// validador no espera. Las dos cosas son fallos, y el primero es el peor:
// el e-32 es la factura mas comun del sistema.
for (const tipo of ['32', '34', '47']) {
  ok(`e-${tipo}: sin fecha NO lanza`,
    lanza(() => vencimientoSecuencia({ sequenceExpiry: null }, tipo)) === null);
  // `sinLanzar` para que una regresion salga como FALLA y no como un volcado
  // de pila a mitad del banco.
  ok(`e-${tipo}: devuelve null, para que el campo se OMITA`,
    sinLanzar(() => vencimientoSecuencia({ sequenceExpiry: null }, tipo)) === null);
  ok(`e-${tipo}: aunque la secuencia TENGA fecha, sigue devolviendo null`,
    sinLanzar(() => vencimientoSecuencia({ sequenceExpiry: '31-12-2027' }, tipo)) === null,
    String(sinLanzar(() => vencimientoSecuencia({ sequenceExpiry: '31-12-2027' }, tipo))));
}

for (const tipo of ['31', '33', '41', '43', '44', '45', '46']) {
  ok(`e-${tipo}: SI exige la fecha`, exigeVencimientoSecuencia(tipo));
}
ok('un tipo desconocido se trata como que SI la exige (fallar es mas barato que omitir)',
  exigeVencimientoSecuencia('99'));

console.log('\n5) El cliente omite el campo, no lo manda vacio\n');

{
  const cli = fuente('src/services/dgii/msellerClient.ts');
  ok('el campo es opcional en la interfaz del IdDoc',
    /FechaVencimientoSecuencia\?: string;/.test(cli));
  ok('se arma condicionalmente en un solo sitio',
    /const vencimiento = params\.sequenceExpiry/.test(cli));
  // Aparece UNA vez, y es dentro del `const vencimiento`. Si vuelve a haber
  // dos, alguna rama lo esta poniendo a pelo otra vez.
  ok('el campo se nombra en un unico sitio del fichero',
    (cli.match(/FechaVencimientoSecuencia: params\.sequenceExpiry/g) || []).length === 1,
    String((cli.match(/FechaVencimientoSecuencia: params\.sequenceExpiry/g) || []).length));
  ok('y ese sitio es la condicion, no un IdDoc',
    /\?\s*\{ FechaVencimientoSecuencia: params\.sequenceExpiry \}/.test(cli));
  ok('las tres ramas que lo llevan lo esparcen',
    (cli.match(/\.\.\.vencimiento,/g) || []).length === 3,
    String((cli.match(/\.\.\.vencimiento,/g) || []).length));
  ok('sequenceExpiry admite null en la firma',
    /sequenceExpiry: string \| null;/.test(cli));
}

console.log('\n6) Lo IMPRESO tampoco lleva fecha inventada\n');

// Era `: '31-12-2027'` en las tres rutas de impresion: una fecha de vencimiento
// fabricada, en el comprobante del cliente, bajo el rotulo "Fecha Vencimiento".
for (const r of ['src/app/api/v1/invoices/[id]/print/route.ts',
                 'src/app/api/v1/invoices/[id]/pdf/route.ts',
                 'src/app/api/v1/invoices/[id]/email/route.ts']) {
  ok(`${r.split('/').slice(-2).join('/')}: sin fecha de respaldo`,
    !/'31-12-\d{4}'/.test(fuente(r)));
}
{
  const tpl = fuente('src/utils/templates/documentTemplates.ts');
  ok('la plantilla decide por la lista unica, no por un array a mano',
    /exigeVencimientoSecuencia\(inv\.ecfType\)/.test(tpl));
  ok('y ya no lleva la lista escrita (se olvidaba el e-33)',
    !/\['31', '44', '45', '46'\]\.includes\(inv\.ecfType\)/.test(tpl));
}

console.log('\n7) Una fecha en un tipo que no la lleva NO bloquea la emision\n');

// Lo encontrado en produccion: el e-32 tenia cargado `31-12-2026` -- una fecha
// puesta a mano, no una autorizacion real. Los dos validadores comprobaban el
// vencimiento SIN MIRAR EL TIPO, asi que el 1 de enero de 2027 la factura de
// consumo habria dejado de emitirse con un error que pedia renovar un SACF
// que no hacia falta. Cuatro meses de margen y nadie lo habria visto venir.
for (const [f, patron] of [
  ['src/services/ecfValidator.ts',
   /if \(exigeVencimientoSecuencia\(ecfType\) && seq\.sequenceExpiry\)/],
  ['src/repositories/companyRepository.ts',
   /if \(exigeVencimientoSecuencia\(ecfType\) && seq\.sequenceExpiry\)/],
] as Array<[string, RegExp]>) {
  const src = fuente(f);
  ok(`${f.split('/').pop()}: el vencimiento se mira solo donde aplica`, patron.test(src));
  ok(`${f.split('/').pop()}: ya no comprueba a secas`,
    !/if \(seq\.sequenceExpiry\) \{/.test(src));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
