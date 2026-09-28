/**
 * Lote 220 -- el codigo HTTP con que mSeller rechaza un envio ya no se tira:
 * dice la causa en el acto y se guarda en `dgii_submissions.response_code`.
 *
 * POR QUE
 * -------
 * Sin marca de rechazo de la DGII, todo fallo de `sendDocument` acababa en el
 * mismo "Enviado, pero la respuesta no llego completa", fuera un 401
 * (credenciales), un 400 o un corte de red. La causa aparecia, como mucho, a
 * los 30 minutos ("mSeller no reconoce este e-NCF"). Medido el 2026-09-28 (solo
 * lectura): de 85 envios, NINGUNO fallo por HTTP. El lote es para el dia que
 * pase -- credenciales vencidas es lo tipico --, no para algo que pase hoy.
 *
 * LO QUE NO CAMBIA, y el banco lo vigila como invariante: el DESENLACE. Un 4xx
 * sigue siendo `desconocido` (la factura queda en `submitted`, sin reenvio).
 *
 * El banco EJECUTA: la tabla de causas, el mensaje, y `sendDocument` contra un
 * `fetch` sustituido.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

process.env.CERTIFICATE_ENCRYPTION_KEY ||= 'clave-de-juguete-del-banco';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

/** El mensaje de siempre, sin codigo. No puede cambiar: lo leen pantallas y bancos. */
const MENSAJE_DE_SIEMPRE =
  'Enviado, pero la respuesta no llego completa (read ECONNRESET). ' +
  'El comprobante PUDO haber llegado a la DGII: no se reenvia para no duplicarlo. ' +
  'El estado se consulta automaticamente y se actualizara solo.';

async function main() {
  console.log('\n1) La causa de cada codigo, ejecutada\n');
  let C: typeof import('../src/services/dgii/causaDelFallo') | null = null;
  try { C = await import('../src/services/dgii/causaDelFallo'); } catch { C = null; }
  const ETQ = ['401: credenciales, y donde se arreglan', '403: la clave de API', '400: el formato',
    '429: el limite', '5xx: el servidor', 'otro 4xx: generico, con su numero',
    'sin codigo o 2xx: nada que decir', '4xx es rechazo de la peticion; 5xx no'];
  if (!C) {
    for (const t of ETQ) ok(t, false, 'no existe causaDelFallo.ts');
  } else {
    const c = C.causaDelCodigoHttp;
    ok(ETQ[0], /credenciales/.test(c(401) ?? '') && /HTTP 401/.test(c(401) ?? '') && /Configuración/.test(c(401) ?? ''));
    ok(ETQ[1], /clave de API/.test(c(403) ?? '') && /HTTP 403/.test(c(403) ?? ''));
    ok(ETQ[2], /formato/.test(c(400) ?? '') && /HTTP 400/.test(c(400) ?? ''));
    ok(ETQ[3], /límite/.test(c(429) ?? '') && /HTTP 429/.test(c(429) ?? ''));
    ok(ETQ[4], /servidor/.test(c(500) ?? '') && /HTTP 503/.test(c(503) ?? ''));
    ok(ETQ[5], /HTTP 418/.test(c(418) ?? '') && !/credenciales|formato/.test(c(418) ?? ''));
    ok(ETQ[6], c(undefined) === null && c(null) === null && c(200) === null && c(302) === null);
    ok(ETQ[7], C.esRechazoDeLaPeticion(401) && C.esRechazoDeLaPeticion(499) && !C.esRechazoDeLaPeticion(500)
      && !C.esRechazoDeLaPeticion(undefined) && C.esFalloDelServidor(503) && !C.esFalloDelServidor(401));
  }

  console.log('\n2) El mensaje que se guarda\n');
  const D = await import('../src/services/dgii/desenlaceEnvio');
  const m401 = D.mensajeDesconocido('Unauthorized', 401);
  ok('un 401 dice que NO se envio, y por que', /^No enviado: /.test(m401) && /credenciales/.test(m401), m401.slice(0, 90));
  ok('  sin afirmarlo mas de lo que se sabe', /Según mSeller/.test(m401) && /No se reenvía solo/.test(m401));
  const m503 = D.mensajeDesconocido('Service Unavailable', 503);
  ok('un 5xx dice la causa pero mantiene la duda', /servidor de mSeller \(HTTP 503\)/.test(m503) && /PUDO haber llegado/.test(m503));
  invariante('sin codigo, el mensaje de siempre, letra por letra',
    D.mensajeDesconocido('read ECONNRESET') === MENSAJE_DE_SIEMPRE && D.mensajeDesconocido('read ECONNRESET', null) === MENSAJE_DE_SIEMPRE);
  // El desenlace lo decide `leerDesenlace`, que no mira el codigo: un 401 sin
  // marca de rechazo sigue siendo desconocido. Es la salvaguarda del lote.
  invariante('un 4xx sin marca de rechazo sigue siendo desenlace DESCONOCIDO',
    D.leerDesenlace('Unauthorized', { error: 'Unauthorized' }).desenlace === 'desconocido');

  console.log('\n3) sendDocument devuelve el codigo, ejecutado contra un fetch sustituido\n');
  const { MSellerClient } = await import('../src/services/dgii/msellerClient');
  const { encryptAsync } = await import('../src/utils/encryption');
  const clave = await encryptAsync('api-key-de-juguete');
  const fetchOriginal = globalThis.fetch;
  const pedido = async (codigo: number) => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/customer/authentication')) {
        return new Response(JSON.stringify({ idToken: 'token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'motivo de prueba' }), { status: codigo });
    }) as typeof fetch;
    try {
      const cliente = new MSellerClient({
        baseUrl: 'https://banco.invalid', entorno: 'TesteCF',
        email: `banco-${codigo}@x`, password: 'p', apiKeyEncrypted: clave,
      });
      return await cliente.sendDocument({} as never);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  };
  for (const codigo of [401, 400, 503]) {
    const r = await pedido(codigo) as { success: boolean; codigoHttp?: number; message?: string };
    ok(`un ${codigo} llega con su codigo`, r.success === false && r.codigoHttp === codigo, `codigoHttp=${r.codigoHttp}`);
  }

  console.log('\n4) El codigo viaja hasta la fila\n');
  const servicio = sinComentarios(leer('src/services/invoice/invoiceSubmissionService.ts'));
  ok('la emision lee el codigo de la respuesta', /codigoHttp = msellerRes\.codigoHttp \?\? null;/.test(servicio));
  ok('  lo usa en el mensaje', /mensajeDesconocido\(errMsg, codigoHttp\)/.test(servicio));
  ok('  y lo devuelve con el resultado', /msellerRequestPayload,\s*codigoHttp,\s*\}/.test(servicio));
  const booker = sinComentarios(leer('src/services/invoice/invoiceDbBooker.ts'));
  ok('las dos filas de envio con respuesta lo guardan en response_code',
    (booker.match(/responseCode: submission\.codigoHttp != null \? String\(submission\.codigoHttp\) : null,/g) ?? []).length === 2);
  const worker = sinComentarios(leer('src/infrastructure/jobRunners.ts'));
  ok('el envio diferido tambien: mensaje y columna',
    (worker.match(/mensajeDesconocido\(result\.message \|\| '', result\.codigoHttp\)/g) ?? []).length === 2
    && (worker.match(/responseCode: result\.codigoHttp != null \? String\(result\.codigoHttp\) : null,/g) ?? []).length === 2);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
