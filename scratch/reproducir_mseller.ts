/**
 * Reproduccion de los dos fallos de mSeller que se reportaron juntos.
 *
 *   1. "no espera lo suficiente para esperar una respuesta de mseller"
 *   2. "cuando sincronizo una factura y vuelvo a imprimirla me genera un
 *      codigo de seguridad aleatorio, no es el mismo que me da mseller"
 *
 * No son dos fallos: son el mismo camino roto visto en dos momentos. El envio
 * se corta a los 12 segundos, la respuesta que traia el codigo de seguridad se
 * pierde, y al imprimir el codigo se INVENTA con un sha256 del id de la
 * factura. Y la sincronizacion posterior, en vez de recuperar el codigo, lo
 * remata: pisa la respuesta guardada con la respuesta de otra consulta que no
 * lleva codigo ninguno.
 *
 * Aqui no se arregla nada. Se levanta un mSeller de mentira en local y se
 * recorre el codigo REAL del proyecto para medir donde se rompe cada cosa.
 */
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createHash } from 'crypto';

process.env.CERTIFICATE_ENCRYPTION_KEY =
  process.env.CERTIFICATE_ENCRYPTION_KEY || 'clave-de-banco-de-pruebas-no-es-un-secreto';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

/** El codigo de seguridad que devolveria mSeller de verdad. */
const CODIGO_REAL = 'A1B2C3D4E5F60718';

/**
 * mSeller de mentira. Guarda si LLEGO a contestar el documento aunque el
 * cliente ya se hubiera ido: eso es lo que importa: que la DGII lo acepto
 * mientras nosotros dabamos el envio por fallido.
 */
function servidorFalso(opciones: {
  demoraMs: number;
  /** donde viene el codigo: al primer nivel o anidado en dgiiResponse */
  codigoAnidado?: boolean;
}) {
  const estado = { documentoProcesado: false, peticiones: 0 };
  const server: Server = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      if (req.url?.includes('/customer/authentication')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ idToken: 'token-de-mentira' }));
        return;
      }
      if (req.url?.includes('/documentos-ecf')) {
        estado.peticiones++;
        setTimeout(() => {
          // El servidor SIEMPRE termina su trabajo. Que el cliente siga ahi
          // para oirlo es otra cuestion, y esa es justamente la cuestion.
          estado.documentoProcesado = true;
          const respuesta = opciones.codigoAnidado
            ? {
                trackId: 'TRK-001',
                dgiiResponse: [
                  JSON.stringify({ estado: 'Aceptado', codigoSeguridad: CODIGO_REAL, mensajes: [] }),
                ],
              }
            : {
                trackId: 'TRK-001',
                estado: 'Aceptado',
                securityCode: CODIGO_REAL,
                qr_url: 'https://ecf.dgii.gov.do/e-cf/Consulta?...',
              };
          if (res.writableEnded || res.destroyed) return;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(respuesta));
        }, opciones.demoraMs);
        return;
      }
      res.writeHead(404);
      res.end('{}');
    });
  });
  return { server, estado };
}

async function arrancar(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function main() {
  const { MSellerClient } = await import('../src/services/dgii/msellerClient');
  const { encryptAsync } = await import('../src/utils/encryption');
  const apiKeyEncrypted = await encryptAsync('api-key-de-mentira');

  const cliente = (baseUrl: string) =>
    new MSellerClient({
      baseUrl,
      entorno: 'TesteCF',
      email: 'banco@ejemplo.test',
      password: 'no-es-un-secreto',
      apiKeyEncrypted,
    });

  const payload: any = { ECF: { Encabezado: {}, DetallesItems: {} } };

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n1) CUANTO ESPERA EL ENVIO\n');

  {
    const { server, estado } = servidorFalso({ demoraMs: 1000 });
    const url = await arrancar(server);
    const t0 = Date.now();
    const r = await cliente(url).sendDocument(payload);
    const ms = Date.now() - t0;
    server.close();

    ok('CONTROL: si mSeller contesta en 1s, todo va bien', r.success === true, r.message);
    ok('  y trae el codigo de seguridad', r.securityCode === CODIGO_REAL, String(r.securityCode));
    console.log(`        (tardo ${ms} ms; el documento se proceso: ${estado.documentoProcesado})`);
  }

  {
    // 14 s: por encima del limite de 12 s que tiene sendDocument. Es una
    // demora perfectamente normal en la DGII, que firma y responde.
    const { server, estado } = servidorFalso({ demoraMs: 14000 });
    const url = await arrancar(server);
    const t0 = Date.now();
    const r = await cliente(url).sendDocument(payload);
    const ms = Date.now() - t0;
    // Se espera a que el servidor termine, para preguntarle si proceso.
    await new Promise((r2) => setTimeout(r2, 14000 - ms + 500));
    server.close();

    ok('REPRODUCIDO: mSeller tarda 14s y el envio se da por fallido',
      r.success === false && /timeout/i.test(r.message || ''), r.message);
    console.log(`        se rindio a los ${ms} ms (el limite esta en 12000)`);
    ok('  y sin embargo el documento SI se proceso al otro lado',
      estado.documentoProcesado === true);
    ok('  el codigo de seguridad se pierde', !r.securityCode, String(r.securityCode));

    console.log('');
    console.log('        Consecuencia en la aplicacion:');
    console.log('        - el mensaje lleva "timeout", asi que se trata como error');
    console.log('          de comunicacion (invoiceSubmissionService, isCommunicationError)');
    console.log('        - el usuario ve el confirm "¿emitir localmente?" y reenvia');
    console.log('        - el segundo envio lleva el MISMO NCF de un e-CF que la DGII');
    console.log('          ya pudo haber aceptado en el primero');
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2) DONDE VIENE EL CODIGO DE SEGURIDAD\n');

  {
    const { server } = servidorFalso({ demoraMs: 200, codigoAnidado: true });
    const url = await arrancar(server);
    const r = await cliente(url).sendDocument(payload);
    server.close();

    ok('la respuesta se acepta', r.success === true, r.message);
    ok('REPRODUCIDO: con el codigo dentro de dgiiResponse, no se lee',
      r.securityCode === undefined, String(r.securityCode));
    console.log('        `securityCode: raw?.securityCode` solo mira el primer nivel,');
    console.log('        y tampoco prueba `codigoSeguridad`. Es el mismo agujero que');
    console.log('        ya se tapo para el ESTADO con leerEstado().');
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3) LA SINCRONIZACION PISA EL CODIGO GUARDADO\n');

  {
    // Lo que se guarda al emitir: la respuesta del envio, con su codigo.
    let responsePayload = JSON.stringify({
      trackId: 'TRK-001',
      estado: 'Aceptado',
      securityCode: CODIGO_REAL,
      qr_url: 'https://ecf.dgii.gov.do/e-cf/Consulta?...',
    });

    const leerComoImprime = (p: string) => {
      const j = JSON.parse(p);
      return j.securityCode || j.codigoSeguridad || '';
    };

    ok('CONTROL: recien emitida, se imprime el codigo de mSeller',
      leerComoImprime(responsePayload) === CODIGO_REAL, leerComoImprime(responsePayload));

    // Ahora el usuario sincroniza. La ruta GET /api/v1/ecf/[id]/dgii-status
    // consulta el ESTADO (otro endpoint, otra forma) y hace:
    //     UPDATE dgii_submissions SET response_payload = <respuesta del estado>
    // La respuesta del estado NO lleva codigo de seguridad: no es su trabajo.
    const respuestaDelEstado = {
      ncf: 'E310000000001',
      estado: 'Aceptado',
      mensajes: [],
      dgiiResponse: ['{"estado":"Aceptado","mensajes":[]}'],
    };
    responsePayload = JSON.stringify(respuestaDelEstado);

    ok('REPRODUCIDO: tras sincronizar, el codigo ya no esta',
      leerComoImprime(responsePayload) === '', `"${leerComoImprime(responsePayload)}"`);

    // Y al imprimir, en vez de admitir que no consta, se fabrica uno.
    const idFactura = '9f1c2d3e-0000-0000-0000-000000000001';
    const ncf = 'E310000000001';
    const inventado = createHash('sha256').update(idFactura + ncf).digest('hex')
      .substring(0, 16).toUpperCase();

    ok('  y en su lugar se imprime uno fabricado con sha256',
      inventado !== CODIGO_REAL, `mSeller: ${CODIGO_REAL} / impreso: ${inventado}`);

    console.log('');
    console.log('        No es aleatorio -- es sha256(id + ncf), siempre el mismo para');
    console.log('        la misma factura -- pero eso lo empeora: parece estable y');
    console.log('        legitimo. El QR que lo acompaña apunta a la consulta de la');
    console.log('        DGII con ese codigo dentro, donde nunca va a validar.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n4) LA SINCRONIZACION TOCA TODAS LAS FILAS, NO LA SUYA\n');

  console.log('        Las dos rutas de sincronizacion actualizan asi:');
  console.log('');
  console.log('          UPDATE dgii_submissions SET response_payload = ...');
  console.log('           WHERE invoice_id = ? AND company_id = ? AND modo = ?');
  console.log('');
  console.log('        Sin decir QUE intento. Es exactamente el patron que');
  console.log('        verificar_envios_dgii.ts ya probo destructivo y que se');
  console.log('        corrigio en los trabajos de la cola: aqui quedo sin corregir.');
  console.log('        Con dos intentos, sincronizar machaca tambien el aceptado.');

  console.log(`\n${fallos === 0 ? 'Reproduccion completa' : `${fallos} comprobacion(es) no salieron como se esperaba`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
