/**
 * Sentry: solo errores, sin datos personales, sin secretos en el repositorio.
 *
 * LOTE 153. Decidido por el dueño el 2026-09-16: errores del servidor (tambien
 * los 500 que las rutas atrapan), del navegador y de los workers; sin trazas ni
 * grabacion de sesiones. DSN y token por variables de entorno de Vercel.
 *
 * Se EJECUTAN el filtro y las opciones; el cableado se lee. LO QUE NO PRUEBA:
 * que un evento llegue a Sentry (hace falta el DSN desplegado: prueba manual).
 */
import fs from 'fs';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};
const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');
const leerCrudo = (ruta: string) => (fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '');

async function main() {
  console.log('\n0) Precondiciones\n');
  const INSTR = leer('src/instrumentation.ts');
  exige('instrumentation sigue arrancando los workers y el barrido de temporales',
    INSTR.includes("await import('./infrastructure/worker');") && INSTR.includes("await import('./services/jobs/reportQueue');"));
  exige('el proxy de sesion no cubre /monitoring (el tunel no pide login)',
    /matcher: \[/.test(leer('src/proxy.ts')) && !/monitoring/.test(leer('src/proxy.ts')));

  let f: typeof import('../src/lib/observabilidad/filtroSentry') | null = null;
  try { f = await import('../src/lib/observabilidad/filtroSentry'); } catch { f = null; }
  const r = (s: string) => f?.redactar(s) ?? s;

  console.log('\n1) Lo que se retira de los textos\n');
  ok('cedula con y sin guiones', r('cliente 001-1234567-8 y 00112345678') === 'cliente [CEDULA] y [CEDULA]', r('cliente 001-1234567-8 y 00112345678'));
  ok('RNC con y sin guiones', r('RNC 1-01-12345-6 / 101123456') === 'RNC [RNC] / [RNC]', r('RNC 1-01-12345-6 / 101123456'));
  ok('correos', r('enviado a juan.perez@latindoors.com.do') === 'enviado a [CORREO]');
  ok('JWT, Bearer y tokens de Sentry',
    r('t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123') === 't=[TOKEN]'
    && r('Authorization: Bearer abc.def-123') === 'Authorization: Bearer [TOKEN]'
    && r('token sntryu_TOKENDEPRUEBA0000') === 'token [TOKEN]');
  ok('NO toca e-NCF, importes, UUID ni telefonos de 10 digitos',
    !!f && r('E310000000020 por 30302.40 id 38a1a51e-cb4a-4798-ad19-0f44a7ded32d tel 8095551234')
      === 'E310000000020 por 30302.40 id 38a1a51e-cb4a-4798-ad19-0f44a7ded32d tel 8095551234',
    r('E310000000020 por 30302.40 id 38a1a51e-cb4a-4798-ad19-0f44a7ded32d tel 8095551234'));

  console.log('\n2) Lo que se retira del evento\n');
  {
    const conEstado = (status: number) => Object.assign(new Error('x'), { status });
    ok('un error de negocio con 4xx no se envia; uno sin estado o 500 si',
      !!f && f.esErrorEsperado(conEstado(409)) && f.esErrorEsperado(conEstado(400)) && !f.esErrorEsperado(conEstado(500)) && !f.esErrorEsperado(new Error('x'))
      && f.limpiarEvento({ message: 'm' }, conEstado(409)) === null && f.limpiarEvento({ message: 'm' }, new Error('x')) !== null);
    const evento = {
      message: 'fallo con 001-1234567-8',
      exception: { values: [{ value: 'cliente juan@x.com', stacktrace: { frames: [{ vars: { factura: { rnc: '101123456' } } }] } }] },
      request: { url: 'https://app/api/v1/customers?search=juan', query_string: 'search=juan', cookies: { accessToken: 'eyJ' }, headers: { authorization: 'Bearer x' }, data: { rnc: '101123456' }, env: { REMOTE_ADDR: '1.2.3.4' } },
      user: { id: 'u1', email: 'juan@x.com', ip_address: '1.2.3.4' },
      extra: { cuerpo: { rnc: '101123456' } },
      breadcrumbs: [{ category: 'console', message: 'factura 101123456' }, { category: 'fetch', message: 'GET', data: { url: '/api?rnc=101123456' } }],
    };
    const limpio = f?.limpiarEvento(structuredClone(evento), new Error('x'));
    ok('mensaje y excepcion redactados, sin variables locales de los marcos',
      !!limpio && limpio.message === 'fallo con [CEDULA]' && limpio.exception?.values?.[0].value === 'cliente [CORREO]'
      && limpio.exception?.values?.[0].stacktrace?.frames?.[0].vars === undefined);
    ok('la peticion sin cookies, cabeceras, cuerpo, entorno ni consulta; la URL sin ?',
      !!limpio && limpio.request?.url === 'https://app/api/v1/customers' && limpio.request?.cookies === undefined
      && limpio.request?.headers === undefined && limpio.request?.data === undefined && limpio.request?.env === undefined && limpio.request?.query_string === undefined);
    ok('del usuario solo el id, y sin extra',
      !!limpio && JSON.stringify(limpio.user) === '{"id":"u1"}' && limpio.extra === undefined);
    ok('sin migas de consola, y las demas sin sus datos',
      !!limpio && limpio.breadcrumbs?.length === 1 && limpio.breadcrumbs[0].category === 'fetch' && limpio.breadcrumbs[0].data === undefined);
    ok('de una llamada de consola solo cuenta un Error de verdad',
      !!f && f.errorDeLaLlamada(['Error x:', new Error('y')])?.message === 'y' && f.errorDeLaLlamada(['solo texto', { a: 1 }]) === null);
  }

  console.log('\n3) Las opciones del SDK\n');
  {
    let o: typeof import('../src/lib/observabilidad/opcionesSentry') | null = null;
    try { o = await import('../src/lib/observabilidad/opcionesSentry'); } catch { o = null; }
    const antes = process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const sinDsn = o?.opcionesSentry();
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://clave@o1.ingest.us.sentry.io/1';
    const conDsn = o?.opcionesSentry();
    if (antes === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN; else process.env.NEXT_PUBLIC_SENTRY_DSN = antes;
    ok('sin DSN apagado; con DSN encendido y el DSN sale del entorno',
      !!sinDsn && sinDsn.enabled === false && !!conDsn && conDsn.enabled === true && conDsn.dsn === 'https://clave@o1.ingest.us.sentry.io/1');
    ok('sin datos personales por defecto, y sin trazas ni integraciones extra',
      !!conDsn && conDsn.sendDefaultPii === false && !('tracesSampleRate' in conDsn) && !('tracesSampler' in conDsn) && !('integrations' in conDsn)
      && !('replaysSessionSampleRate' in conDsn) && !('replaysOnErrorSampleRate' in conDsn));
    ok('beforeSend pasa por el filtro (descarta un 409) y las migas de consola no se crean',
      !!conDsn && conDsn.beforeSend({ message: 'm' }, { originalException: Object.assign(new Error('x'), { status: 409 }) }) === null
      && conDsn.beforeBreadcrumb({ category: 'console' }) === null && conDsn.beforeBreadcrumb({ category: 'fetch' }) !== null);
  }

  console.log('\n4) El cableado\n');
  ok('servidor: init con las opciones al empezar, antes de los workers',
    /import \* as Sentry from '@sentry\/nextjs';/.test(INSTR) && /Sentry\.init\(opcionesSentry\(\)\);/.test(INSTR)
    && INSTR.indexOf('Sentry.init(opcionesSentry());') < INSTR.indexOf("await import('./infrastructure/worker');")
    && INSTR.indexOf("if (process.env.NEXT_RUNTIME === 'nodejs') {") < INSTR.indexOf('Sentry.init(opcionesSentry());'));
  ok('servidor: los errores sin atrapar por onRequestError', /export const onRequestError = Sentry\.captureRequestError;/.test(INSTR));
  ok('servidor: los errores atrapados y escritos con console.error se reportan, sin bucle',
    /console\.error = \(\.\.\.args: any\[\]\) => \{\s*originalError\(formatMessage\('ERROR', args\)\);\s*const error = errorDeLaLlamada\(args\);\s*if \(!error \|\| reportando\) return;\s*reportando = true;\s*try \{\s*Sentry\.captureException\(error\);/.test(INSTR)
    && /finally \{\s*reportando = false;\s*\}/.test(INSTR));
  {
    const cliente = leer('src/instrumentation-client.ts');
    ok('navegador: init con las mismas opciones, sin Replay ni trazas',
      /Sentry\.init\(opcionesSentry\(\)\);/.test(cliente) && !/replayIntegration|browserTracingIntegration|tracesSampleRate/.test(cliente));
    const global = leer('src/app/global-error.tsx');
    ok('navegador: global-error reporta el error que rompe la app',
      /^\s*'use client';/.test(global) && /useEffect\(\(\) => \{\s*Sentry\.captureException\(error\);\s*\}, \[error\]\);/.test(global) && /<html lang="es">/.test(global));
  }
  {
    const cfg = leer('next.config.ts');
    ok('next.config envuelto con withSentryConfig, con tunel y sin telemetria',
      /export default withSentryConfig\(nextConfig, \{/.test(cfg) && /tunnelRoute: "\/monitoring",/.test(cfg) && /telemetry: false,/.test(cfg));
    ok('org, proyecto y token salen del entorno; sin token no se suben source maps',
      /org: process\.env\.SENTRY_ORG,/.test(cfg) && /project: process\.env\.SENTRY_PROJECT,/.test(cfg) && /authToken: process\.env\.SENTRY_AUTH_TOKEN,/.test(cfg)
      && /disable: !process\.env\.SENTRY_AUTH_TOKEN,/.test(cfg) && /deleteSourcemapsAfterUpload: true,/.test(cfg));
    ok('un fallo al subir source maps no tumba el despliegue', /errorHandler: \(err\) => \{\s*console\.warn\(/.test(cfg));
  }

  console.log('\n5) Nada secreto en el repositorio, y el paquete como toca\n');
  {
    const ficheros = ['next.config.ts', 'src/instrumentation.ts', 'src/instrumentation-client.ts', 'src/app/global-error.tsx',
      'src/lib/observabilidad/opcionesSentry.ts', 'src/lib/observabilidad/filtroSentry.ts', '.env.example'];
    const crudos = ficheros.map(leerCrudo).join('\n');
    const hayCableado = leerCrudo('next.config.ts').includes('withSentryConfig');
    ok('ni DSN ni token escritos en el codigo',
      hayCableado && !/ingest(\.[a-z]+)?\.sentry\.io\/\d/.test(crudos) && !/sntry[su]_[A-Za-z0-9]{20,}/.test(crudos));
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string> };
    ok('@sentry/nextjs fijado a una version, sin saltarse la edad minima de publicacion de pnpm',
      /^\d+\.\d+\.\d+$/.test(pkg.dependencies?.['@sentry/nextjs'] ?? '') && !/minimumReleaseAgeExclude/.test(leerCrudo('pnpm-workspace.yaml')));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
