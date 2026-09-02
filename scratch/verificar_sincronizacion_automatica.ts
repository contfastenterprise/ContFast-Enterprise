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

ok("un 'submitted' que sigue igual no se reescribe",
  /if \(lectura\.estado === 'submitted'\) \{ resumen\.sinCambio\+\+; continue; \}/.test(servicio));
ok('la firma que ya estaba no se borra (camposDeFirma solo trae lo que vino)',
  /\.\.\.camposDeFirma\(r\.data\)/.test(servicio));
ok('el response_payload del envio no se pisa',
  !/responsePayload:/.test(servicio));

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
