/**
 * El estado de un envio a la DGII no se supone: se afirma.
 *
 * EL FALLO
 * --------
 * La respuesta se interpretaba en cinco sitios y todos daban por ACEPTADA una
 * respuesta que no lo decia. En capas:
 *
 *   1. jobRunners            `(raw.status || raw.estado || 'Aceptado')`
 *   2. jobRunners            `let newStatus = 'accepted'` como valor inicial
 *   3. invoiceSubmission     el mismo `|| 'Aceptado'` ...
 *   4. invoiceSubmission     ... y un `else { finalStatus = 'accepted' }`
 *   5. msellerClient         `let successMsg = 'Aceptado por la DGII'`
 *
 * El quinto es el que hacia inutiles los arreglos de los otros: el mensaje
 * fabricado viaja en `msellerRes.message`, y quien lo recibe lo prefiere sobre
 * cualquier texto propio. Habia que quitarlo tambien.
 *
 * Y dos mas que apareciron leyendo `msellerClient.sendDocument`:
 *
 *   6. `finalStatus = raw?.status || raw?.estado` NO miraba dentro de
 *      `dgiiResponse`, que es donde mSeller reenvia el veredicto de la DGII.
 *   7. `if (finalStatus === 'Rechazado')` comparaba exacto y con mayusculas:
 *      'RECHAZADO' o 'Rechazado por la DGII' se escapaban por la rama de
 *      exito y salian con el mensaje "Aceptado por la DGII".
 *
 * Es el patron de toda la auditoria -- el silencio leido como el caso bueno,
 * igual que `modo` con `DEFAULT 'PRODUCCION'` -- pero aqui el caso bueno es un
 * comprobante fiscal marcado como aceptado por la DGII sin que la DGII lo haya
 * dicho.
 *
 * LA REGLA
 * --------
 * Sin estado, o con un estado que no se entiende, el envio queda en
 * `submitted`: mandado, pendiente de confirmar. Es un estado NO final (los
 * finales son accepted/rejected/failed), asi que se sigue tratando como
 * pendiente, que es lo que es.
 */
import { leerEstado, mensajeEstado, textoEstado } from '../src/services/dgii/estadoEnvio';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente as codigo, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const RAIZ = join(__dirname, '..');
// Fuera comentarios antes de buscar: si no, los comentarios de arriba -- que
// necesariamente citan `|| 'Aceptado'` y `finalStatus = 'accepted'` -- harian
// saltar los detectores y el banco se acusaria a si mismo.

function main() {
  console.log('\n1) Sin estado NO es aceptado\n');

  ok('respuesta vacia -> submitted', leerEstado({}).estado === 'submitted', leerEstado({}).estado);
  ok('null -> submitted', leerEstado(null).estado === 'submitted');
  ok('solo trackId -> submitted', leerEstado({ trackId: 'abc' }).estado === 'submitted');
  ok('y queda marcado como NO reconocido', leerEstado({}).reconocido === false);
  ok('sin inventar texto', leerEstado({}).textoCrudo === null);

  console.log('\n2) Lo que si se entiende\n');

  ok("'Aceptado' -> accepted", leerEstado({ estado: 'Aceptado' }).estado === 'accepted');
  ok("'ACEPTADO' -> accepted", leerEstado({ estado: 'ACEPTADO' }).estado === 'accepted');
  ok("'Rechazado' -> rejected", leerEstado({ estado: 'Rechazado' }).estado === 'rejected');
  ok("'RECHAZADO' -> rejected (antes se escapaba)", leerEstado({ estado: 'RECHAZADO' }).estado === 'rejected');
  ok("'Rechazado por la DGII' -> rejected", leerEstado({ status: 'Rechazado por la DGII' }).estado === 'rejected');
  ok("'Enviado' -> submitted", leerEstado({ estado: 'Enviado' }).estado === 'submitted');
  ok("'En proceso' -> submitted", leerEstado({ estado: 'En proceso' }).estado === 'submitted');

  // El orden importa: "No aceptado" contiene "acept".
  ok("'No aceptado' -> rejected, NO accepted",
    leerEstado({ estado: 'No aceptado' }).estado === 'rejected',
    leerEstado({ estado: 'No aceptado' }).estado);

  console.log('\n3) Un estado que no se reconoce tampoco es aceptado\n');

  const raro = leerEstado({ estado: 'Vaporizado' });
  ok('estado desconocido -> submitted', raro.estado === 'submitted', raro.estado);
  ok('marcado como no reconocido', raro.reconocido === false);
  ok('pero se conserva el texto para poder mirarlo', raro.textoCrudo === 'Vaporizado');

  console.log('\n4) El veredicto anidado en `dgiiResponse` es el que manda\n');

  // mSeller puede decir "ok" en la raiz mientras la DGII rechaza dentro.
  const anidado = leerEstado({
    status: 'ok',
    dgiiResponse: [JSON.stringify({ estado: 'Rechazado', mensajes: [{ codigo: 2, valor: 'RNC invalido' }] })],
  });
  ok('rechazo anidado gana sobre el "ok" de la raiz', anidado.estado === 'rejected', anidado.estado);
  ok('y se lee el texto de dentro', anidado.textoCrudo === 'Rechazado', String(anidado.textoCrudo));

  const anidadoObj = leerEstado({ dgiiResponse: [{ estado: 'Aceptado' }] });
  ok('tambien si viene como objeto, no como cadena', anidadoObj.estado === 'accepted');

  const ilegible = leerEstado({ estado: 'Aceptado', dgiiResponse: ['{roto'] });
  ok('un elemento ilegible no tumba la lectura', ilegible.estado === 'accepted');

  console.log('\n5) El mensaje no afirma lo que no consta\n');

  const m1 = mensajeEstado(leerEstado({}), null);
  ok('sin estado, el mensaje NO dice aceptado', !/acept/i.test(m1), m1);
  ok('y dice que queda pendiente', /pendiente/i.test(m1), m1);

  const m2 = mensajeEstado(leerEstado({ estado: 'Vaporizado' }), null);
  ok('estado raro: el mensaje lo cita', /Vaporizado/.test(m2), m2);
  ok('y tampoco dice aceptado', !/acept/i.test(m2), m2);

  const m3 = mensajeEstado(leerEstado({ estado: 'Aceptado' }), null);
  ok('cuando SI consta, lo dice', /acept/i.test(m3), m3);

  const m4 = mensajeEstado(leerEstado({}), 'Documento recibido con observaciones');
  ok('el mensaje real del proveedor manda', m4 === 'Documento recibido con observaciones', m4);

  console.log('\n6) textoEstado: de donde sale cada campo\n');

  ok('prefiere dgiiResponse sobre la raiz',
    textoEstado({ status: 'ok', dgiiResponse: [{ estado: 'Rechazado' }] }) === 'Rechazado');
  ok('cadena vacia no cuenta como estado', textoEstado({ estado: '   ' }) === null);
  ok('sin nada, null', textoEstado({}) === null);

  console.log('\n7) Que no vuelvan las suposiciones al codigo\n');

  const jr = codigo('src/infrastructure/jobRunners.ts');
  const isv = codigo('src/services/invoice/invoiceSubmissionService.ts');
  const mc = codigo('src/services/dgii/msellerClient.ts');

  ok('jobRunners no inventa "Aceptado"', !/\|\|\s*'Aceptado/.test(jr));
  ok('jobRunners no arranca en accepted', !/newStatus\s*=\s*'accepted'/.test(jr));
  ok('jobRunners usa leerEstado', /leerEstado\(/.test(jr));
  ok('invoiceSubmission no inventa "Aceptado"', !/\|\|\s*'Aceptado/.test(isv));
  ok('invoiceSubmission no tiene el else que aceptaba lo desconocido',
    !/else\s*\{\s*finalStatus\s*=\s*'accepted'/.test(isv));
  ok('invoiceSubmission usa leerEstado', /leerEstado\(/.test(isv));
  ok('msellerClient no fabrica "Aceptado por la DGII" como valor inicial',
    !/let\s+successMsg\s*=\s*'Aceptado/.test(mc), );
  ok('msellerClient no compara el rechazo con === exacto',
    !/finalStatus\s*===\s*'Rechazado'/.test(mc));
  ok('msellerClient usa leerEstado', /leerEstado\(/.test(mc));

  // Y que el propio quita-comentarios funcione: si no quitara nada, las
  // aserciones de arriba fallarian por culpa de los comentarios de este
  // fichero y de los que se escribieron en el codigo.
  const conComentarios = crudo('src/infrastructure/jobRunners.ts');
  ok('control: el fuente CRUDO si contiene el patron (en comentarios)',
    /\|\|\s*'Aceptado/.test(conComentarios));
  ok('control: y el limpio no', !/\|\|\s*'Aceptado/.test(jr));

  console.log('\nZ) `dgiiResponse` es un HISTORIAL: vale la ULTIMA entrada\n');

// EL CASO REAL. E440000000001 de PRODUCCION: la DGII ya lo habia ACEPTADO,
// mSeller lo decia, el sistema escribio "Aceptado" en el mensaje... y el
// estado se quedo en "Enviado".
//
// `dgiiResponse` no es un dato suelto: es el historial del comprobante. La
// DGII anade entradas segun avanza ("Recibido", luego "Aceptado"). Esta
// funcion devolvia la PRIMERA -- un `return` dentro del bucle -- asi que leia
// "Recibido" e ignoraba el "Aceptado" que venia detras.
//
// El codigo que habia en las rutas de sincronizacion recorria todas y se
// quedaba con la ultima. Al unificar la lectura aqui se perdio ese detalle.
{
  const historial = (...estados: string[]) => ({
    dgiiResponse: estados.map((e) => JSON.stringify({ estado: e })),
  });

  ok('Recibido -> Aceptado  =>  aceptado',
    leerEstado(historial('Recibido', 'Aceptado')).estado === 'accepted',
    leerEstado(historial('Recibido', 'Aceptado')).textoCrudo ?? '');
  ok('Recibido -> Rechazado =>  rechazado',
    leerEstado(historial('Recibido', 'Rechazado')).estado === 'rejected');
  ok('En Proceso -> Aceptado => aceptado',
    leerEstado(historial('En Proceso', 'Aceptado')).estado === 'accepted');

  // Con tres entradas, sigue mandando la ultima.
  ok('Recibido -> En Proceso -> Aceptado => aceptado',
    leerEstado(historial('Recibido', 'En Proceso', 'Aceptado')).estado === 'accepted');

  // Y si la ultima es un "en curso", NO se adelanta un veredicto.
  ok('Aceptado -> Recibido => submitted (manda la ultima, sea cual sea)',
    leerEstado(historial('Aceptado', 'Recibido')).estado === 'submitted');

  // Una sola entrada se comporta igual que antes.
  ok('una sola entrada sigue funcionando',
    leerEstado(historial('Aceptado')).estado === 'accepted');

  // Entradas vacias o ilegibles no tapan a la buena.
  ok('una entrada ilegible no invalida las demas',
    leerEstado({ dgiiResponse: ['no es json', '{\"estado\":\"Aceptado\"}'] }).estado === 'accepted');
  ok('un estado vacio no cuenta como ultimo',
    leerEstado({ dgiiResponse: ['{\"estado\":\"Aceptado\"}', '{\"estado\":\"\"}'] }).estado === 'accepted');

  // Sin historial, se siguen mirando los campos de primer nivel.
  ok('sin dgiiResponse, manda el campo de primer nivel',
    leerEstado({ status: 'Aceptado' }).estado === 'accepted');
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
