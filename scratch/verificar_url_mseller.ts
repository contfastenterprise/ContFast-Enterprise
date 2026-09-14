/**
 * Banco del lote 103: una sola direccion de mSeller, y el constructor callado.
 *
 *     pnpm exec tsx scratch/verificar_url_mseller.ts
 *
 * LOS DOS FALLOS, QUE ERAN EL MISMO
 * ---------------------------------
 * 1. El constructor de `MSellerClient` imprimia un `console.log` en CADA
 *    emision. Ruido, y justo encima de donde ahora se leen los tiempos.
 *
 * 2. Ese `console.log` estaba delatando algo: el constructor hacia una limpieza
 *    de la URL por debajo de quien lo construyera. Y al mirarlo aparecieron
 *    SEIS sitios calculando la direccion de mSeller con TRES reglas distintas:
 *
 *      emision, reenvio, XML ...  `endsWith('/v1') ? quitarlo : dejarla`
 *      consultas de estado .....  `endsWith('/v1') ? quitarlo : DEFECTO`
 *      barrido .................  la de por defecto, a pelo
 *
 *    Solo coinciden si la URL acaba en `/v1`. Con una URL propia, la empresa
 *    EMITIA contra su servidor y CONSULTABA contra otro -- y una consulta al
 *    servidor equivocado no encuentra el comprobante, asi que se queda en
 *    Enviado para siempre.
 *
 * POR QUE LA PARTE A EJECUTA
 * --------------------------
 * `urlMseller.ts` es una funcion pura sin dependencias: se le dan URLs de
 * verdad y se mira que devuelve. Eso vale mucho mas que leer el fuente, porque
 * lo que hay que fijar no es como esta escrita la limpieza sino que hace con
 * cada forma que puede llegar de la configuracion.
 *
 * Se carga A MANO, dentro: el modulo lo CREA este lote, y con un `import` de
 * arriba la contraprueba moriria al cargar en vez de fallar comprobacion por
 * comprobacion.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const URL = 'src/services/dgii/urlMseller.ts';
const CLI = 'src/services/dgii/msellerClient.ts';
const SUB = 'src/services/invoice/invoiceSubmissionService.ts';
const JOB = 'src/infrastructure/jobRunners.ts';
const XML = 'src/app/api/v1/invoices/[id]/xml/route.ts';
const EST = 'src/app/api/v1/ecf/[id]/dgii-status/route.ts';
const LOT = 'src/app/api/v1/ecf/dgii-status/batch/route.ts';
const SIN = 'src/services/dgii/sincronizarPendientes.ts';

/** Los seis que construyen un cliente y por tanto necesitan una direccion. */
const LOS_SEIS = [SUB, JOB, XML, EST, LOT, SIN];

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
function nombra(f: string, id: string): boolean {
  return new RegExp(`\\b${id}\\b`).test(codigo(f));
}

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES
// ─────────────────────────────────────────────────────────────────────────
for (const f of [CLI, ...LOS_SEIS]) {
  exige(crudo(f).length > 500, `No se pudo leer ${f}. Revisa desde donde se corre.`);
}
//  Los seis siguen construyendo su propio cliente: si alguien los unificara,
//  el motivo de este lote cambia.
for (const f of LOS_SEIS) {
  exige(codigo(f).includes('new MSellerClient('), `${f} ya no construye un MSellerClient`);
}
//  Y el ajuste sigue existiendo, que es de donde sale todo esto.
exige(codigo('src/db/schema/companies.ts').includes("msellerUrl: text('mseller_url')"),
      'el ajuste mseller_url ha cambiado de nombre o de sitio');

type Modulo = typeof import('../src/services/dgii/urlMseller');

async function main(): Promise<void> {
  let U: Modulo | null = null;
  try {
    U = (await import('../src/services/dgii/urlMseller')) as Modulo;
  } catch {
    U = null;
  }
  function okA(t: string, prueba: () => boolean): void {
    if (!U) { ok(`${t}  [no existe urlMseller.ts]`, false); return; }
    let r = false;
    try { r = prueba(); } catch (e) { console.log(`        ${(e as Error).message}`); }
    ok(t, r);
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. LA REGLA, CON URLS DE VERDAD');
  // ───────────────────────────────────────────────────────────────────────
  const POR_DEFECTO = 'https://ecf.api.mseller.app';

  okA('sin configurar, la de por defecto',
      () => ['', '   ', null, undefined].every((v) => U!.baseUrlMseller(v as never) === POR_DEFECTO));
  okA('la de por defecto con /v1 pierde el /v1',
      () => U!.baseUrlMseller('https://ecf.api.mseller.app/v1') === POR_DEFECTO);
  okA('y sin /v1 se queda igual',
      () => U!.baseUrlMseller(POR_DEFECTO) === POR_DEFECTO);

  //  El arreglo de verdad: una URL propia SE RESPETA. Las dos consultas de
  //  estado la tiraban y ponian la de por defecto.
  okA('una URL propia se respeta, no se sustituye',
      () => U!.baseUrlMseller('https://mi.example.do') === 'https://mi.example.do');
  okA('aunque no acabe en /v1, que era justo el caso que se perdia',
      () => U!.baseUrlMseller('https://mi.example.do/factura') === 'https://mi.example.do/factura');

  okA('la barra final sobra, y las que sean',
      () => U!.baseUrlMseller('https://mi.example.do///') === 'https://mi.example.do');
  okA('el ambiente pegado sobra: lo anade el cliente en cada llamada',
      () => U!.baseUrlMseller('https://mi.example.do/eCF') === 'https://mi.example.do'
         && U!.baseUrlMseller('https://mi.example.do/TesteCF') === 'https://mi.example.do'
         && U!.baseUrlMseller('https://mi.example.do/CerteCF') === 'https://mi.example.do');
  okA('y sin importar como lo escriban',
      () => U!.baseUrlMseller('https://mi.example.do/tesTEcf') === 'https://mi.example.do');
  okA('varios sufijos pegados a la vez, en cualquier orden',
      () => U!.baseUrlMseller('https://mi.example.do/eCF/v1/') === 'https://mi.example.do'
         && U!.baseUrlMseller('https://mi.example.do/v1/eCF') === 'https://mi.example.do');

  okA('el dominio viejo se corrige al de e-CF',
      () => U!.baseUrlMseller('https://api.mseller.app/v1') === POR_DEFECTO);
  okA('y el que ya es el bueno no se toca dos veces',
      () => U!.baseUrlMseller('https://ecf.api.mseller.app') === POR_DEFECTO);

  //  Propiedades, no casos: valen para cualquier entrada.
  const MUESTRA = ['', '   ', '/v1', 'https://x.do', 'https://x.do/', 'https://x.do/eCF/v1/',
                   'https://api.mseller.app/v1', POR_DEFECTO, 'https://mi.example.do/factura'];
  okA('nunca devuelve cadena vacia',
      () => MUESTRA.every((v) => U!.baseUrlMseller(v).length > 0));
  okA('nunca devuelve una barra al final',
      () => MUESTRA.every((v) => !U!.baseUrlMseller(v).endsWith('/')));
  okA('aplicarla dos veces da lo mismo que una',
      () => MUESTRA.every((v) => U!.baseUrlMseller(U!.baseUrlMseller(v)) === U!.baseUrlMseller(v)));

  // ───────────────────────────────────────────────────────────────────────
  console.log('B. LOS SEIS PASAN POR LA MISMA REGLA');
  // ───────────────────────────────────────────────────────────────────────
  //  LLAMARLA NO BASTA: TIENE QUE IMPORTARLA.
  //
  //  La primera version de esto comprobaba solo que el nombre apareciera en el
  //  fichero -- y aparecia, en la llamada. Las tres rutas quedaron llamando a
  //  una funcion que no habian importado, el banco dio TODO OK y lo cazó `tsc`
  //  con tres "Cannot find name". Es la misma trampa de prefijo/presencia que
  //  ya mordio con `documentServiceX`, `MS_ENVIO_X` y el tapon de
  //  `empezarAPerseguir`, cometida esta vez sobre un import que faltaba.
  //
  //  Un banco que se conforma con que el nombre este escrito no comprueba que
  //  el codigo funcione: comprueba que alguien tecleo la palabra.
  for (const [f, quien] of [[SUB, 'la emision'], [JOB, 'el envio en diferido'], [XML, 'el XML'],
                            [EST, 'la consulta de estado'], [LOT, 'la consulta por lotes'],
                            [SIN, 'el barrido']] as const) {
    ok(`${quien} la IMPORTA`,
       /import \{[^}]*\bbaseUrlMseller\b[^}]*\} from '(@\/services\/dgii\/urlMseller|\.\/urlMseller)'/
         .test(codigo(f)));
    ok(`${quien} la usa`, codigo(f).includes('baseUrlMseller('));
  }
  ok('y el propio cliente tambien la importa',
     /import \{[^}]*\bbaseUrlMseller\b[^}]*\} from '\.\/urlMseller'/.test(codigo(CLI)));
  ok('y no queda ni una regla vieja suelta en src/',
     (() => {
       const andar = (d: string): boolean => {
         for (const e of fs.readdirSync(d, { withFileTypes: true })) {
           const p = `${d}/${e.name}`;
           if (e.isDirectory()) { if (andar(p)) return true; }
           else if (/\.tsx?$/.test(p) && sinComentarios(fs.readFileSync(p, 'utf8')).includes("endsWith('/v1')")) return true;
         }
         return false;
       };
       return !andar('src');
     })());
  ok('el barrido ya no lleva la direccion a pelo',
     !codigo(SIN).includes("baseUrl: 'https://ecf.api.mseller.app'"));
  ok('y lee el ajuste de la empresa',
     codigo(SIN).includes('companySettings.msellerUrl'));

  // ───────────────────────────────────────────────────────────────────────
  console.log('C. EL CONSTRUCTOR: SIN RUIDO Y SIN REGLA PROPIA');
  // ───────────────────────────────────────────────────────────────────────
  ok('no queda ningun console en el cliente de mSeller',
     !/console\.(log|info|warn|error|debug)\(/.test(codigo(CLI)));
  ok('el constructor delega la direccion en vez de limpiarla el',
     codigo(CLI).includes('this.baseUrl = baseUrlMseller(config.baseUrl);'));
  ok('y ya no tiene su propia limpieza escondida',
     !codigo(CLI).includes("replace(/\\/TesteCF$/gi") && !codigo(CLI).includes("'ecf.api.mseller.app')"));
  ok('queda escrito que el ruido era la pista',
     crudo(CLI).includes('lo unico que lo delataba'));

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
