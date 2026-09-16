/**
 * Un e-CF rechazado por ESTRUCTURA se lee como rechazado al consultar su estado.
 *
 * EL CASO REAL (lote 139)
 * -----------------------
 * La nota de credito E340000000002 de Latin Doors (02/09/2026) quedo 13 dias en
 * `submitted`, "En Proceso". mSeller la tenia en `Error`, y su historial de la
 * DGII eran 11 entradas: 6 rechazos por estructura del XML y 5 "En Proceso" que
 * mSeller intercala en los reintentos. La ultima, un rechazo. El portal de la
 * DGII: "No fue encontrada la factura (e-CF)". Mientras tanto se emitio una
 * segunda nota por la misma factura, y las dos se asentaron.
 *
 * `textoEstado` se quedaba con la ultima entrada que traia `estado` -- y el
 * rechazo por estructura no trae `estado`, trae `error` y `mensaje` --, asi que
 * leia "En Proceso". En el camino por lotes (cron y persecucion del veredicto)
 * eso es un "en curso" RECONOCIDO: se cuenta y no se escribe nada. Para siempre.
 *
 * Y `msellerClient.getDocumentStatus` tenia su propio bucle para el rotulo, con
 * el mismo salto: la sincronizacion individual habria guardado `rejected` con el
 * mensaje "En Proceso".
 *
 * Se ejecuta la lectura de verdad, con la forma real de la respuesta medida el
 * 2026-09-16 (sin credenciales ni identificadores internos), y el cliente de
 * mSeller contra un `fetch` sustituido.
 */
import { fuente } from './_fuente';

process.env.CERTIFICATE_ENCRYPTION_KEY =
  process.env.CERTIFICATE_ENCRYPTION_KEY || 'clave-de-banco-de-pruebas-no-es-un-secreto';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
/** Una precondicion vale en los dos estados: si no se cumple, el banco no mide nada. */
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

// ─── La respuesta real ────────────────────────────────────────────────────
const ERROR_ESTRUCTURA = JSON.stringify({
  trackId: null,
  error: 'Estructura del archivo XML inválida. ',
  mensaje: "The element 'Totales' has invalid child element 'MontoExento'. List of possible elements expected: 'ITBIS2, ITBIS3, TotalITBIS, TotalITBIS1, TotalITBIS2, TotalITBIS3, MontoImpuestoAdicional, ImpuestosAdicionales, MontoTotal'.",
});
const EN_PROCESO = (dia: string) => JSON.stringify({
  trackId: '00000000-0000-0000-0000-000000000000', rnc: '132796845', encf: 'E340000000002',
  codigo: 0, estado: 'En Proceso', secuenciaUtilizada: false, fechaRecepcion: `2026-09-0${dia}T05:00:38.380Z`,
});
const NOTA_0002 = {
  ncf: 'E340000000002',
  status: 'Error',
  retryCount: 5,
  dgiiResponse: [
    ERROR_ESTRUCTURA, EN_PROCESO('3'), ERROR_ESTRUCTURA, EN_PROCESO('4'), ERROR_ESTRUCTURA, EN_PROCESO('5'),
    ERROR_ESTRUCTURA, EN_PROCESO('6'), ERROR_ESTRUCTURA, EN_PROCESO('7'), ERROR_ESTRUCTURA,
  ],
};
// La que SI acepto la DGII, una hora despues. Con su ruido real: el aviso de
// correo al receptor que no se pudo entregar (texto suelto, no JSON).
const NOTA_0003 = {
  ncf: 'E340000000003',
  status: 'Aceptado',
  dgiiResponse: [
    JSON.stringify({ trackId: '11111111-1111-1111-1111-111111111111', error: null, mensaje: null }),
    '"Error trying to send the invoice to the customer: RNC 131204619 eCF: E340000000003 | getaddrinfo ENOTFOUND procigar.ddns.net"',
    JSON.stringify({ trackId: '11111111-1111-1111-1111-111111111111', codigo: '1', estado: 'Aceptado', rnc: '132796845', encf: 'E340000000003', secuenciaUtilizada: true, mensajes: [{ valor: '', codigo: 0 }] }),
  ],
};

async function main() {
  const { leerEstado, mensajeEstado } = await import('../src/services/dgii/estadoEnvio');
  const { leerDesenlace } = await import('../src/services/dgii/desenlaceEnvio');

  console.log('\n0) Precondiciones: lo que ya funcionaba sigue igual\n');

  exige('la nota aceptada se lee aceptada', leerEstado(NOTA_0003).estado === 'accepted', JSON.stringify(leerEstado(NOTA_0003)));
  exige('un "en curso" que es la ULTIMA entrada sigue en curso',
    leerEstado({ dgiiResponse: [ERROR_ESTRUCTURA, EN_PROCESO('8')] }).estado === 'submitted');
  exige('un rechazo por estructura CORREGIDO y despues aceptado es aceptado',
    leerEstado({ dgiiResponse: [ERROR_ESTRUCTURA, JSON.stringify({ estado: 'Aceptado' })] }).estado === 'accepted');
  // E440000000001: "read ECONNRESET" es un corte entre mSeller y la DGII. No es
  // un veredicto. Tiene `error` y NO puede leerse como rechazo.
  //  Y no borra lo que habia antes: el "Recibido" sigue siendo el estado
  //  (reconocido), no se cae al "Error" de la raiz.
  {
    const red = leerEstado({ status: 'Error', dgiiResponse: [JSON.stringify({ estado: 'Recibido' }), JSON.stringify({ trackId: null, error: 'read ECONNRESET' })] });
    exige('un error de red en el historial NO es rechazo, ni tapa el estado anterior',
      red.estado === 'submitted' && red.textoCrudo === 'Recibido' && red.reconocido === true, JSON.stringify(red));
  }
  exige('un error de red suelto tampoco',
    leerEstado({ status: 'Error', dgiiResponse: [JSON.stringify({ trackId: null, error: 'read ECONNRESET', mensaje: 'socket hang up' })] }).estado === 'submitted');
  exige('"Error" a secas en la raiz no es rechazo (necesita atencion, no veredicto)',
    leerEstado({ status: 'Error' }).estado === 'submitted' && leerEstado({ status: 'Error' }).reconocido === false);
  exige('la emision sigue viendo el rechazo por estructura',
    leerDesenlace(null, JSON.parse(ERROR_ESTRUCTURA)).desenlace === 'rechazo');
  exige('y sigue sin ver rechazo en un corte de red',
    leerDesenlace('read ECONNRESET').desenlace === 'desconocido');
  {
    const sinc = fuente('src/services/dgii/sincronizarPendientes.ts');
    exige('el camino por lotes decide con leerEstado sobre r.data', /const lectura = leerEstado\(r\.data \?\? \{ status: r\.status \}\);/.test(sinc));
    exige('y escribe el estado leido', /status: lectura\.estado,/.test(sinc));
  }

  console.log('\n1) La respuesta REAL de E340000000002\n');

  const l = leerEstado(NOTA_0002);
  ok('se lee RECHAZADA', l.estado === 'rejected', JSON.stringify(l).slice(0, 120));
  ok('reconocida como veredicto, no como estado raro', l.reconocido === true && l.estado === 'rejected');
  ok('el texto trae el elemento que sobra (MontoExento)', /MontoExento/.test(l.textoCrudo ?? ''), l.textoCrudo ?? 'null');
  ok('y lo que dijo mSeller, tal cual', /^Estructura del archivo XML inválida\./.test(l.textoCrudo ?? ''), l.textoCrudo ?? 'null');
  const m = mensajeEstado(l, null);
  ok('el mensaje que se guarda dice rechazado y por que',
    /^Rechazado por la DGII \(/.test(m) && /MontoExento/.test(m), m.slice(0, 90));

  console.log('\n2) La regla, sin el ruido del caso real\n');

  ok('en curso -> rechazo por estructura  =>  rechazado',
    leerEstado({ dgiiResponse: [EN_PROCESO('1'), ERROR_ESTRUCTURA] }).estado === 'rejected');
  ok('tambien si la entrada llega como objeto y no como cadena',
    leerEstado({ dgiiResponse: [{ estado: 'En Proceso' }, JSON.parse(ERROR_ESTRUCTURA)] }).estado === 'rejected');
  ok('basta con el validador en `mensaje` aunque `error` diga otra cosa',
    leerEstado({ dgiiResponse: [{ estado: 'Recibido' }, { error: 'Fallo', mensaje: "The element 'IdDoc' has invalid child element 'X'." }] }).estado === 'rejected');
  ok('un texto de estado que es la marca del validador tambien es rechazo',
    leerEstado({ status: 'Estructura del archivo XML inválida.' }).estado === 'rejected');

  console.log('\n3) El cliente de mSeller: el rotulo sale de la misma lectura\n');

  {
    const { MSellerClient } = await import('../src/services/dgii/msellerClient');
    const { encryptAsync } = await import('../src/utils/encryption');
    const apiKeyEncrypted = await encryptAsync('api-key-de-mentira');
    const original = globalThis.fetch;
    globalThis.fetch = (async (entrada: string | URL | Request) => {
      const url = String(entrada);
      const cuerpo = url.includes('/customer/authentication') ? { idToken: 'token-de-mentira' } : NOTA_0002;
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    try {
      const cliente = new MSellerClient({
        baseUrl: 'https://mseller.banco.invalid/v1', entorno: 'eCF',
        email: 'banco@banco.invalid', password: 'x', apiKeyEncrypted,
      });
      const r = await cliente.getDocumentStatus('E340000000002');
      exige('la consulta sustituida responde', r.success === true, JSON.stringify(r).slice(0, 120));
      ok('dgiiStatus ya no dice "En Proceso"', r.dgiiStatus !== 'En Proceso', String(r.dgiiStatus));
      ok('el mensaje que guarda la sincronizacion individual nombra el rechazo',
        /Estructura del archivo XML/.test(r.message ?? '') && /MontoExento/.test(r.message ?? ''), String(r.message).slice(0, 90));
      //  Sola, la igualdad valdria tambien antes del arreglo: los dos leian "En
      //  Proceso". Se ata a que esa lectura comun sea el rechazo.
      ok('y coincide con lo que decide leerEstado, que es rechazo',
        r.dgiiStatus === leerEstado(r.rawResponse).textoCrudo && leerEstado(r.rawResponse).estado === 'rejected');
    } finally {
      globalThis.fetch = original;
    }
  }

  console.log('\n4) Una sola lista de marcas\n');

  {
    const des = fuente('src/services/dgii/desenlaceEnvio.ts');
    const est = fuente('src/services/dgii/estadoEnvio.ts');
    const cli = fuente('src/services/dgii/msellerClient.ts');
    ok('desenlaceEnvio importa la lista compartida',
      /import \{\s*MARCAS_RECHAZO\s*\} from '\.\/marcasRechazo';/.test(des));
    ok('y ya no declara la suya (con el import presente)',
      /from '\.\/marcasRechazo'/.test(des) && !/const MARCAS_RECHAZO\b/.test(des));
    ok('estadoEnvio usa las mismas marcas',
      /import \{\s*marcaDeRechazo\s*\} from '\.\/marcasRechazo';/.test(est) && /\bmarcaDeRechazo\(/.test(est.replace(/import[^;]+;/g, '')));
    ok('el cliente ya no recorre dgiiResponse por su cuenta',
      /const finalDGIIStatus = lectura\.textoCrudo \|\| 'Sin estado';/.test(cli) && !/let dgiiEstado\b/.test(cli));
    try {
      const mod = await import('../src/services/dgii/marcasRechazo');
      ok('el modulo compartido exporta la lista y la funcion',
        Array.isArray(mod.MARCAS_RECHAZO) && mod.MARCAS_RECHAZO.length === 7 && mod.marcaDeRechazo('has invalid child element') !== null);
    } catch {
      ok('el modulo compartido exporta la lista y la funcion', false, 'no existe marcasRechazo.ts');
    }
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
