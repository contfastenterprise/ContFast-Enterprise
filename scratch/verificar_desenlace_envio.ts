/**
 * Un rechazo se AFIRMA. Y el estado se lee en un solo sitio.
 *
 * DOS FALLOS, EL MISMO PATRON
 * ---------------------------
 * 1. `invoiceSubmissionService` preguntaba "?es un error de red?" contra una
 *    lista de siete cadenas, y si no coincidia ninguna concluia que la DGII
 *    habia RECHAZADO. `read ECONNRESET` esquivo la lista -- "econnreset" no
 *    contiene "connection" -- y un corte de conexion se guardo como rechazo
 *    estructural de la DGII, en produccion.
 *
 *    Es el mismo patron de toda la auditoria, del reves: donde el codigo viejo
 *    leia el silencio como "Aceptado", este lo leia como "Rechazado".
 *
 * 2. La interpretacion del estado estaba escrita a mano en TRES sitios, y en
 *    dos de ellos la comprobacion de "acept" iba ANTES que la de "rechaz", de
 *    modo que un "No Aceptado" se habria leido como ACEPTADO.
 */
import { leerDesenlace, mensajeDesconocido } from '../src/services/dgii/desenlaceEnvio';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) Los cortes de red NO son rechazos de la DGII\n');

// La lista vieja solo cubria tres de estos. Los demas se convertian en rechazo.
for (const err of [
  'read ECONNRESET',
  'connect ECONNREFUSED 10.0.0.1:443',
  'write EPIPE',
  'connect ETIMEDOUT',
  'getaddrinfo ENOTFOUND ecf.api.mseller.app',
  'getaddrinfo EAI_AGAIN',
  'socket hang up',
  'The operation was aborted',
  'fetch failed',
  '',
]) {
  ok(`${JSON.stringify(err)} -> desconocido, no rechazo`,
    leerDesenlace(err).desenlace === 'desconocido');
}

console.log('\n2) Un rechazo de verdad SI se reconoce\n');

const rechazos: Array<[string, string]> = [
  ["The element 'IdDoc' has invalid child element 'IndicadorMontoGravado'. List of possible elements expected: ...",
   'el rechazo real del primer e-44 de esta empresa'],
  ['Rechazado: la secuencia no esta autorizada', 'texto con "rechazado"'],
  ['Documento no aceptado por la DGII', 'texto con "no aceptado"'],
  ['Status: rejected', 'texto en ingles'],
  ["The value 'X' is not valid according to its datatype", 'el validador rechaza un tipo'],
];
for (const [msg, que] of rechazos) {
  const l = leerDesenlace(msg);
  ok(`${que} -> rechazo`, l.desenlace === 'rechazo', l.marca ?? 'sin marca');
}

console.log('\n3) "No aceptado" NO se lee como aceptado\n');

// Contiene "acept". Las copias que miraban la aceptacion primero lo habrian
// dado por bueno.
ok('"No Aceptado" es rechazo', leerDesenlace('No Aceptado').desenlace === 'rechazo');
ok('y su marca lo dice',
  /no aceptado/i.test(leerDesenlace('No Aceptado').marca ?? ''),
  leerDesenlace('No Aceptado').marca ?? '');

console.log('\n4) La respuesta tambien se mira, con la MISMA lectura\n');

ok('un estado de rechazo dentro de la respuesta cuenta',
  leerDesenlace('algo raro', { status: 'Rechazado' }).desenlace === 'rechazo');
ok('un estado que no es rechazo no lo convierte en uno',
  leerDesenlace('algo raro', { status: 'En Proceso' }).desenlace === 'desconocido');
ok('sin respuesta, sin marcas: desconocido',
  leerDesenlace('algo raro').desenlace === 'desconocido');

console.log('\n4b) EL RECHAZO QUE NO TRAE ESTADO (el que se me escapo)\n');

// LA RESPUESTA REAL que recibio la nota de credito E340000000002:
//
//   {"trackId":null,
//    "error":"Estructura del archivo XML invalida. ",
//    "mensaje":"The element 'Totales' has invalid child element 'MontoExento'..."}
//
// HTTP 200, sin `status`, sin `estado`, sin `dgiiResponse`. `leerEstado` no
// encuentra estado y devuelve 'submitted'; y el mensaje que llegaba a
// `leerDesenlace` era "Error 400 de mSeller", sin ninguna marca. Resultado: un
// RECHAZO guardado como ENVIADO, que ademas dejo su factura bloqueada en el
// buscador de notas.
//
// El detalle esta en `error` y `mensaje`, dos campos que nadie miraba.
{
  const respuestaReal = {
    trackId: null,
    error: 'Estructura del archivo XML inválida. ',
    mensaje: "The element 'Totales' has invalid child element 'MontoExento'. " +
             "List of possible elements expected: 'ITBIS2, ITBIS3, TotalITBIS, " +
             "TotalITBIS1, TotalITBIS2, TotalITBIS3, MontoImpuestoAdicional, " +
             "ImpuestosAdicionales, MontoTotal'.",
  };

  const r = leerDesenlace('Error 400 de mSeller', respuestaReal);
  ok('la respuesta real de E340000000002 es un RECHAZO', r.desenlace === 'rechazo', r.marca ?? '');
  ok('y la marca dice que se encontro DENTRO de la respuesta',
    /dentro de la respuesta/.test(r.marca ?? ''));

  // Sin mirar dentro seguiria siendo desconocido: es lo que fallaba.
  ok('el mensaje suelto por si solo NO tiene marcas',
    leerDesenlace('Error 400 de mSeller').desenlace === 'desconocido');

  // La otra forma en que mSeller lo dice. El acento cuenta.
  ok('"Estructura del archivo XML invalida" tambien basta',
    leerDesenlace(null, { error: 'Estructura del archivo XML inválida. ' }).desenlace === 'rechazo');

  // Anidado dentro de una cadena JSON, como llega `dgiiResponse`.
  ok('lo encuentra aunque venga anidado en una cadena JSON',
    leerDesenlace(null, { dgiiResponse: ['{"mensajes":[{"valor":"Rechazado por la DGII"}]}'] })
      .desenlace === 'rechazo');

  // Y NO convierte en rechazo una respuesta normal.
  ok('una respuesta buena sigue siendo desconocida, no rechazo',
    leerDesenlace(null, { trackId: 'abc', securityCode: 'X1Y2Z3', qr_url: 'https://...' })
      .desenlace === 'desconocido');
  ok('ni una que solo dice que va en proceso',
    leerDesenlace(null, { status: 'En Proceso' }).desenlace === 'desconocido');
}

console.log('\n4c) El cliente lo detecta antes de dar el envio por bueno\n');

{
  const cli = fuente('src/services/dgii/msellerClient.ts');
  ok('el cliente consulta leerDesenlace sobre la respuesta',
    /const porEstructura = leerDesenlace\(null, raw\);/.test(cli));
  ok('y entra en la rama de rechazo tambien por esa via',
    /if \(lectura\.estado === 'rejected' \|\| porEstructura\.desenlace === 'rechazo'\)/.test(cli));
  ok('el motivo real llega al mensaje (error y mensaje, no solo message)',
    /\[raw\?\.error, raw\?\.mensaje\]\.filter\(Boolean\)/.test(cli));
  ok('y el HTTP no-ok tampoco se queda en "Error NNN"',
    /\[raw\?\.message, raw\?\.error, raw\?\.mensaje\]\.filter\(Boolean\)/.test(cli));
}

console.log('\n5) El mensaje dice lo que se sabe y lo que no\n');

{
  const m = mensajeDesconocido('read ECONNRESET');
  ok('dice que PUDO haber llegado', /PUDO haber llegado/.test(m));
  ok('dice que NO se reenvia, y por que', /no se reenvia para no duplicarlo/i.test(m));
  ok('dice que se resolvera solo', /se consulta automaticamente/i.test(m));
  ok('y conserva el error original', m.includes('read ECONNRESET'));
  ok('NUNCA dice que la DGII rechazo', !/rechaz/i.test(m), m.slice(0, 60));
}

console.log('\n6) La emision ya no concluye rechazo por descarte\n');

{
  const svc = fuente('src/services/invoice/invoiceSubmissionService.ts');
  ok('se acabo la lista de cadenas de red',
    !/isCommunicationError/.test(svc));
  ok('el rechazo se decide con leerDesenlace',
    /const lectura = leerDesenlace\(errMsg, msellerRes\.rawResponse\)/.test(svc));
  ok("y solo se lanza EcfRejectedError si la lectura dice 'rechazo'",
    /if \(lectura\.desenlace === 'rechazo'\) \{\s*throw new EcfRejectedError/.test(svc));
  ok("un desenlace desconocido queda en 'submitted'",
    (svc.match(/finalStatus = 'submitted';/g) || []).length === 2,
    String((svc.match(/finalStatus = 'submitted';/g) || []).length));
  ok('y NO se queda en `signed` (que quemaba el NCF sin factura)',
    !/finalStatus = 'signed';/.test(svc));
}

console.log('\n7) UNA sola interpretacion del estado en todo el sistema\n');

const RUTAS = [
  'src/app/api/v1/ecf/dgii-status/batch/route.ts',
  'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
];
for (const r of RUTAS) {
  const src = fuente(r);
  ok(`${r.split('/').slice(-2).join('/')}: usa leerEstado`,
    /leerEstado\(/.test(src));
  ok(`${r.split('/').slice(-2).join('/')}: sin cadena propia de includes`,
    !/includes\('acept'\)/.test(src) && !/includes\('rechaz'\)/.test(src));
}
ok('la unica cadena de includes que queda es la de estadoEnvio',
  (['src/services/dgii/estadoEnvio.ts', ...RUTAS,
    'src/services/dgii/sincronizarPendientes.ts']
    .filter((f) => /includes\('acept'\)/.test(fuente(f)))).length === 1);

console.log('\n8) Un e-NCF que mSeller no conoce deja de ser invisible\n');

{
  const sinc = fuente('src/services/dgii/sincronizarPendientes.ts');
  ok('el "no encontrado" ya no es un continue mudo',
    /if \(!r\.found\) \{/.test(sinc) && /resumen\.desconocidos\+\+/.test(sinc));
  ok('espera un rato antes de darlo por no llegado',
    /MINUTOS_PARA_DARLO_POR_NO_LLEGADO/.test(sinc));
  ok('lo deja escrito en la factura',
    /mSeller no reconoce este e-NCF/.test(sinc));
  ok('y NO lo reenvia solo',
    !/addJob\(/.test(sinc) && /NO se ha reenviado/.test(sinc));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
