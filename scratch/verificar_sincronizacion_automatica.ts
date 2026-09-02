/**
 * La consulta del veredicto se hace sola, y la puerta que la dispara esta cerrada.
 *
 * EL FALLO
 * --------
 * mSeller NO devuelve el veredicto de la DGII al enviar: devuelve la firma, y el
 * veredicto se consulta despues. `submitted` es por tanto el estado correcto
 * justo tras emitir. Lo que faltaba es que alguien volviera a preguntar.
 *
 * Nadie lo hacia. El comprobante se quedaba en "Enviado" hasta que una persona
 * abria la factura y pulsaba "Sincronizar" -- y si no lo hacia, para siempre.
 * Reportado por el cliente como "tengo que sincronizar los datos".
 *
 * LO QUE SE COMPRUEBA AQUI
 * ------------------------
 * Que la consulta automatica existe, que NO reenvia, que lee el estado con la
 * misma funcion que la emision, y sobre todo que la ruta que la dispara no es
 * una puerta abierta: corre sin sesion de usuario y toca los comprobantes de
 * TODAS las empresas.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const servicio = fuente('src/services/dgii/sincronizarPendientes.ts');
const ruta = fuente('src/app/api/v1/cron/sincronizar-ecf/route.ts');

console.log('\n1) Consulta, y NO reenvia\n');

ok('consulta el estado por lotes',
  /getDocumentsStatusBatch\(/.test(servicio));
ok('NO encola ningun reenvio',
  !/addJob\(/.test(servicio) && !/submit-ecf/.test(servicio));
ok('no vuelve a mandar el documento',
  !/sendDocument|enviarDocumento|documentos-ecf/.test(servicio));
ok('solo mira los que estan en submitted',
  /eq\(invoices\.status, 'submitted'\)/.test(servicio));
// `fuente()` quita los comentarios, asi que esto mira CODIGO: 'signed' no
// aparece en ninguna condicion. Los emitidos y nunca enviados son de la cola de
// reenvio, no de una consulta de estado.
ok("y NO toca los 'signed' (esos nunca se enviaron: son de la cola)",
  !/'signed'/.test(servicio));

console.log('\n2) El estado se lee en un solo sitio\n');

// La ruta de sincronizacion manual tiene su propia copia escrita a mano, y en
// ella la comprobacion de "acept" va ANTES que la de "rechaz". Este servicio no
// repite esa logica.
ok('usa leerEstado, la misma que la emision',
  /import \{[^}]*leerEstado[^}]*\} from '@\/services\/dgii\/estadoEnvio'/.test(servicio));
ok('no lleva su propia cadena de includes',
  !/includes\('acept'\)/.test(servicio) && !/includes\('rechaz'\)/.test(servicio));

console.log('\n3) El ambiente sale del modo, empresa por empresa\n');

ok('el entorno se deduce del modo',
  /entornoDgii\(modo as ModoSistema\)/.test(servicio));
ok('las credenciales se piden PARA ese entorno',
  /credencialesMseller\(companyId, entorno\)/.test(servicio));
ok('se agrupa por empresa Y modo',
  /\$\{p\.companyId\}\|\$\{p\.modo\}/.test(servicio));
// La propiedad de verdad, no el comentario que la describe: el try/catch esta
// DENTRO del bucle de empresas, anota el error en el resumen de esa empresa, y
// el bucle sigue empujando resultados.
ok('un fallo en una empresa no para a las demas',
  /catch \(err: any\) \{[\s\S]{0,400}?resumen\.error = err\?\.message/.test(servicio)
  && /\}\s*salida\.push\(resumen\);\s*\}\s*return salida;/.test(servicio));

console.log('\n4) Solo se escribe cuando HAY veredicto\n');

// Un "en curso" RECONOCIDO (Recibido, En Proceso) se cuenta y se sigue, sin
// escribir nada: reescribirlo cada pasada mueve `updated_at` y borra la pista
// de cuando cambio de verdad. Lo NO reconocido si se anota -- ver 4b.
ok("un 'submitted' reconocido no se reescribe, solo se cuenta",
  /if \(lectura\.estado === 'submitted'\) \{[\s\S]{0,900}?\} else \{\s*resumen\.sinCambio\+\+;\s*\}\s*continue;\s*\}/.test(servicio));
ok('la firma que ya estaba no se borra (camposDeFirma solo trae lo que vino)',
  /\.\.\.camposDeFirma\(r\.data\)/.test(servicio));
ok('el response_payload del envio no se pisa',
  !/responsePayload:/.test(servicio));

console.log('\n4b) Un "Error" de mSeller NO se queda callado\n');

// EL CASO REAL: E440000000001 de PRODUCCION figura en mSeller con estado
// "Error" y respuesta de la DGII "read ECONNRESET". El corte fue entre mSeller
// y la DGII, no entre el sistema y mSeller.
//
// `leerEstado('Error')` devuelve 'submitted' con `reconocido: false` -- porque
// "Error" no es ni aceptado, ni rechazado, ni un "en curso" conocido. El
// consultador lo metia en el mismo `continue` mudo que un "En Proceso", asi
// que el comprobante se quedaba en "Enviado" PARA SIEMPRE sin que nadie
// supiera que mSeller ya habia dado el envio por fallido.
//
// Un "en curso" se espera; un "Error" no se resuelve esperando.
{
  ok('distingue lo reconocido de lo que no lo es',
    /if \(!lectura\.reconocido && lectura\.textoCrudo\)/.test(servicio));
  ok('lo cuenta aparte de los que simplemente siguen en curso',
    /resumen\.requierenAtencion\+\+/.test(servicio)
    && /resumen\.sinCambio\+\+/.test(servicio));
  ok('escribe en la factura LO QUE dijo mSeller, textual',
    /mSeller reporta este comprobante como "\$\{lectura\.textoCrudo\}"/.test(servicio));
  ok('y dice que NO se emita uno nuevo',
    /NO emitir uno nuevo/.test(servicio));
  ok('reenviar es cosa de una persona: el consultador no lo hace',
    !/addJob\(/.test(servicio));
  // Reescribir el mismo aviso cada pasada mueve `updated_at` y borra la pista
  // de cuando ocurrio de verdad.
  ok('no reescribe el aviso si no cambia nada',
    /if \(factura\.mensaje !== aviso\)/.test(servicio));
  ok('para eso trae el mensaje actual en la consulta',
    /mensaje: invoices\.dgiiMessage/.test(servicio));
}

console.log('\n4c) El boton de reenvio coincide con la regla real\n');

// El boton decia `['rejected', 'failed']`:
//   - 'failed' NO es un estado de factura (draft|signed|submitted|accepted|
//     rejected|void), asi que esa mitad no se cumplia nunca;
//   - faltaba 'signed', que significa emitida en local y NUNCA enviada -- el
//     caso que mas claramente hay que poder reenviar, y no habia boton.
// El endpoint ya aceptaba los cuatro: el boton era mas restrictivo que la
// regla que el propio servidor aplica.
{
  const pantalla = fuente('src/app/dashboard/ecf/page.tsx');
  const endpoint = fuente('src/app/api/v1/ecf/[id]/resubmit/route.ts');

  ok("el boton ya no menciona 'failed', que no existe",
    !/\['rejected', 'failed'\]\.includes\(inv\.status\)/.test(pantalla));
  ok("y ofrece 'signed', que nunca llego a enviarse",
    /\['rejected', 'signed', 'draft'\]\.includes\(inv\.status\)/.test(pantalla));

  // Lo que el boton ofrece tiene que estar dentro de lo que el endpoint acepta.
  const permitidos = (endpoint.match(/!\['([^\]]+)'\]\.includes\(invoice\.status\)/) || [])[1] ?? '';
  for (const e of ['rejected', 'signed', 'draft']) {
    ok(`el endpoint acepta '${e}'`, permitidos.includes(e), permitidos);
  }

  // Y 'submitted' se queda fuera A PROPOSITO: ahi el documento SI salio.
  // (El porque esta escrito junto al boton, pero `fuente()` quita los
  //  comentarios: no se puede afirmar desde aqui. Lo que si se comprueba es la
  //  condicion, que es lo que manda.)
  ok("'submitted' NO se ofrece: reenviarlo duplicaria el comprobante",
    !/'submitted'\]\.includes\(inv\.status\)/.test(pantalla)
    && !/'rejected', 'signed', 'draft', 'submitted'/.test(pantalla));
}

console.log('\n5) LA PUERTA: la ruta no puede quedar abierta\n');

// Corre sin sesion y toca todas las empresas. Es el punto mas delicado.
ok('exige un secreto por cabecera',
  /process\.env\.CRON_SECRET/.test(ruta) && /authorization/i.test(ruta));
ok('SIN secreto configurado, la ruta NO funciona (503)',
  /if \(!esperado \|\| esperado\.trim\(\) === ''\)/.test(ruta) && /status: 503/.test(ruta));
ok('la comparacion es de tiempo constante',
  /timingSafeEqual/.test(ruta));
ok('y no se cae a un `===` sobre cadenas',
  !/recibido === esperado/.test(ruta));
ok('el 401 no distingue "falta" de "no coincide"',
  (ruta.match(/status: 401/g) || []).length === 1);
ok('no acepta POST ni nada que modifique por otra via',
  !/export async function POST/.test(ruta));
ok('declara maxDuration como literal (Vercel lo exige)',
  /export const maxDuration = 60;/.test(ruta));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
