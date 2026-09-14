/**
 * Banco del lote 105: el logo deja de viajar por red en cada impresion.
 *
 *     pnpm exec tsx scratch/verificar_imagenes_incrustadas.ts
 *
 * EL PROBLEMA
 * -----------
 * El PDF lo dibuja un Chromium de verdad, y `generatePdfFromHtml` espera a que
 * carguen todas las imagenes antes de imprimir -- si no, el PDF sale sin logo
 * la mitad de las veces. El QR ya iba en base64; el LOGO era una URL de
 * Supabase, asi que Chromium salia a la red a buscarla EN CADA IMPRESION, con
 * una venta esperando.
 *
 * DONDE SE ARREGLA, Y POR QUE AHI
 * -------------------------------
 * Hay 35 sitios que meten `logoUrl` en los datos de una plantilla. Convertir en
 * cada uno serian 35 cambios y 35 ocasiones de olvidarse, y el siguiente que
 * anada una plantilla empezaria de cero. Se hace UNA vez, en el ultimo paso
 * antes de dibujar: vale para todas las plantillas, las de ahora y las que
 * vengan, y es donde se paga el coste.
 *
 * UN `fetch` DE MENTIRA, NO UN SERVIDOR
 * -------------------------------------
 * La primera version de este banco levantaba un servidor en 127.0.0.1 y no
 * llego a probar NADA: el filtro de direcciones de este mismo modulo rechaza el
 * bucle local -- con razon -- asi que el camino bueno no se ejecutaba nunca y
 * la comprobacion se quedo en `typeof html === 'string'`, que da OK con
 * cualquier cosa.
 *
 * Suplantando `fetch` se fija lo que de verdad importa -- que la imagen entra,
 * que no se pide dos veces, que lo raro se deja pasar sin romper nada -- sin
 * salir a la red y sin ablandar el filtro para poder probarlo.
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

const GEN = 'src/services/print/pdfGenerator.ts';
const PRINT = 'src/app/api/v1/invoices/[id]/print/route.ts';
const PDF = 'src/app/api/v1/invoices/[id]/pdf/route.ts';

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(crudo(GEN).length > 3000, `No se pudo leer ${GEN}. Revisa desde donde se corre.`);
exige(codigo(GEN).includes('getBrowser()'), 'el PDF ya no lo dibuja un navegador propio');
exige(codigo(GEN).includes("querySelectorAll('img')"),
      'el generador ya no espera a que carguen las imagenes: el motivo del lote cambia');
exige(codigo(GEN).includes('generateQrBase64'),
      'el QR ya no se genera en base64: era el ejemplo de como debia estar el logo');

type Modulo = typeof import('../src/services/print/imagenesIncrustadas');

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const DATA_PNG = 'data:image/png;base64,';
const PNG_OK = () => new Response(PIXEL, { status: 200, headers: { 'content-type': 'image/png' } });

async function main(): Promise<void> {
  let M: Modulo | null = null;
  try {
    M = (await import('../src/services/print/imagenesIncrustadas')) as Modulo;
  } catch {
    M = null;
  }

  const fetchDeVerdad = globalThis.fetch;
  let peticiones: string[] = [];
  let responder: () => Response = PNG_OK;

  globalThis.fetch = (async (entrada: unknown) => {
    const url = typeof entrada === 'string' ? entrada : String((entrada as { url?: string })?.url ?? entrada);
    peticiones.push(url);
    return responder();
  }) as typeof fetch;

  async function okA(t: string, prueba: () => Promise<boolean> | boolean): Promise<void> {
    if (!M) { ok(`${t}  [no existe imagenesIncrustadas.ts]`, false); return; }
    let r = false;
    try { r = await prueba(); } catch (e) { console.log(`        ${(e as Error).message}`); }
    ok(t, r);
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    console.log('A. DIRECCIONES: SOLO SE SALE A DONDE SE DEBE');
    // ─────────────────────────────────────────────────────────────────────
    //  `logoUrl` lo escribe alguien en Ajustes: es una URL que un usuario
    //  controla y que el SERVIDOR va a pedir. Apuntarla a una direccion interna
    //  la traeria y la meteria dentro de un PDF descargable.
    await okA('no sale hacia direcciones privadas ni al servicio de metadatos', async () => {
      const peligrosas = [
        'http://169.254.169.254/latest/meta-data/',
        'http://127.0.0.1/secreto.png',
        'http://10.0.0.5/x.png',
        'http://192.168.1.10/x.png',
        'http://172.16.0.1/x.png',
        'http://localhost/x.png',
      ];
      peticiones = [];
      for (const u of peligrosas) {
        const r = await M!.incrustarImagenes(`<img src="${u}">`);
        if (r.incrustadas !== 0 || !r.html.includes(u)) return false;
      }
      return peticiones.length === 0;
    });

    await okA('ni hacia esquemas que no son http', async () => {
      const r = await M!.incrustarImagenes('<img src="file:///etc/passwd">');
      return r.incrustadas === 0 && r.encontradas === 0;
    });

    // ─────────────────────────────────────────────────────────────────────
    console.log('B. LO QUE SI: SE TRAE, SE INCRUSTA Y NO SE REPITE');
    // ─────────────────────────────────────────────────────────────────────
    await okA('una imagen remota acaba DENTRO del HTML, en base64', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = []; responder = PNG_OK;
      const u = 'https://cdn.ejemplo.do/logo.png';
      const r = await M!.incrustarImagenes(`<img class="logo" src="${u}" alt="Logo">`);
      //  `deCache === 0` importa tanto como el resto: si el recuento se hiciera
      //  DESPUES de traerla, esta primera vez ya diria 1 y el numero no
      //  significaria nada. Sin esta comprobacion ese fallo pasaba entero.
      return r.incrustadas === 1 && r.html.includes(DATA_PNG)
        && !r.html.includes(u) && peticiones.length === 1 && r.deCache === 0;
    });

    await okA('la segunda impresion NO vuelve a pedirla', async () => {
      peticiones = [];
      const r = await M!.incrustarImagenes('<img src="https://cdn.ejemplo.do/logo.png">');
      return r.incrustadas === 1 && r.deCache === 1 && peticiones.length === 0;
    });

    await okA('dos logos distintos son dos descargas, no una', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      const r = await M!.incrustarImagenes(
        '<img src="https://cdn.ejemplo.do/a.png"><img src="https://cdn.ejemplo.do/b.png">'
      );
      return r.encontradas === 2 && r.incrustadas === 2 && peticiones.length === 2;
    });

    await okA('el mismo logo repetido en la pagina se pide UNA vez', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      const u = 'https://cdn.ejemplo.do/repetido.png';
      const r = await M!.incrustarImagenes(`<img src="${u}"><img src="${u}"><img src="${u}">`);
      return r.encontradas === 1 && peticiones.length === 1
        && (r.html.match(/data:image\/png/g) ?? []).length === 3;
    });

    await okA('tambien con comillas simples', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      const r = await M!.incrustarImagenes("<img src='https://cdn.ejemplo.do/c.png'>");
      return r.incrustadas === 1 && r.html.includes(DATA_PNG);
    });

    //  Solo el `src` de un `<img>`. Una URL mencionada en un texto no es una
    //  imagen que el navegador vaya a pedir, y sustituirla seria estropear el
    //  documento.
    await okA('no toca una URL que solo se menciona en el texto', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      const html = '<p>Descargue en https://cdn.ejemplo.do/manual.png</p>';
      const r = await M!.incrustarImagenes(html);
      return r.html === html && r.encontradas === 0 && peticiones.length === 0;
    });

    //  Y el caso que de verdad separa "sustituir el src" de "sustituir la URL":
    //  la MISMA direccion en un `<img>` y escrita en el texto. Sustituir a lo
    //  bruto se llevaria tambien la del parrafo, metiendo un base64 de 3 kB en
    //  mitad de una frase. Sin este caso, ese fallo pasaba desapercibido.
    await okA('la misma URL en un img y en el texto: solo cambia la del img', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      const u = 'https://cdn.ejemplo.do/logo.png';
      const r = await M!.incrustarImagenes(`<img src="${u}"><p>Esta en ${u} por si acaso</p>`);
      return r.incrustadas === 1
        && r.html.includes(DATA_PNG)
        && r.html.includes(`Esta en ${u} por si acaso`);
    });

    await okA('el QR que ya venia en base64 no se toca', async () => {
      const html = '<img src="data:image/png;base64,AAAA">';
      const r = await M!.incrustarImagenes(html);
      return r.html === html && r.encontradas === 0;
    });

    await okA('un HTML sin imagenes sale igual que entro', async () => {
      const html = '<p>Factura E310000000001</p>';
      const r = await M!.incrustarImagenes(html);
      return r.html === html && r.encontradas === 0 && r.incrustadas === 0;
    });

    // ─────────────────────────────────────────────────────────────────────
    console.log('C. NUNCA ROMPE UNA IMPRESION');
    // ─────────────────────────────────────────────────────────────────────
    await okA('si la descarga falla, la URL se queda y el HTML sigue sirviendo', async () => {
      M!._vaciarCacheDeImagenes(); peticiones = [];
      responder = () => new Response('no', { status: 500 });
      const u = 'https://cdn.ejemplo.do/roto.png';
      const r = await M!.incrustarImagenes(`<img src="${u}">`);
      return r.incrustadas === 0 && r.html.includes(u);
    });

    await okA('y no se guarda en el cache lo que fallo', () => M!._imagenesGuardadas() === 0);

    await okA('una imagen enorme no se mete dentro de la factura', async () => {
      M!._vaciarCacheDeImagenes();
      responder = () => new Response(Buffer.alloc(3 * 1024 * 1024), {
        status: 200, headers: { 'content-type': 'image/png' },
      });
      const u = 'https://cdn.ejemplo.do/enorme.png';
      const r = await M!.incrustarImagenes(`<img src="${u}">`);
      return r.incrustadas === 0 && r.html.includes(u);
    });

    await okA('lo que no es una imagen tampoco', async () => {
      M!._vaciarCacheDeImagenes();
      responder = () => new Response('<p>hola</p>', {
        status: 200, headers: { 'content-type': 'text/html' },
      });
      const u = 'https://cdn.ejemplo.do/pagina';
      const r = await M!.incrustarImagenes(`<img src="${u}">`);
      return r.incrustadas === 0 && r.html.includes(u);
    });

    await okA('si el que sirve no dice el tipo, se deduce de la extension', async () => {
      M!._vaciarCacheDeImagenes();
      responder = () => new Response(PIXEL, { status: 200 });
      const r = await M!.incrustarImagenes('<img src="https://cdn.ejemplo.do/logo.png">');
      responder = PNG_OK;
      return r.incrustadas === 1 && r.html.includes(DATA_PNG);
    });

    // ─────────────────────────────────────────────────────────────────────
    console.log('D. EL GENERADOR LO USA, Y MIDE');
    // ─────────────────────────────────────────────────────────────────────
    ok('el generador IMPORTA la incrustacion',
       /import \{[^}]*\bincrustarImagenes\b[^}]*\} from '\.\/imagenesIncrustadas'/.test(codigo(GEN)));
    ok('y la aplica ANTES de dibujar',
       (() => {
         const t = codigo(GEN);
         const i = t.indexOf('await incrustarImagenes(html)');
         const j = t.indexOf('this.dibujar(');
         return i > 0 && j > 0 && i < j;
       })());
    ok('el dibujo de siempre quedo intacto, en su propio metodo',
       codigo(GEN).includes('private static async dibujar('));
    ok('cada render deja el reparto por tramos',
       codigo(GEN).includes("Logger.info('[tiempos-pdf] render'"));
    ok('diciendo si el navegador estaba caliente o hubo que arrancarlo',
       codigo(GEN).includes("this.ultimoArranqueEnCaliente ? 'caliente' : 'arrancado'"));
    ok('y se registra pase lo que pase',
       /finally\s*\{[\s\S]{0,400}\[tiempos-pdf\]/.test(codigo(GEN)));

    // ─────────────────────────────────────────────────────────────────────
    console.log('E. LA PLATAFORMA NO CORTA ANTES');
    // ─────────────────────────────────────────────────────────────────────
    for (const [f, quien] of [[PRINT, 'la vista de impresion'], [PDF, 'la descarga del PDF']] as const) {
      ok(`${quien} declara cuanto puede durar`, /export const maxDuration = \d+;/.test(codigo(f)));
    }
    ok('y se explica por que hace falta declararlo',
       crudo(PRINT).includes('subir un plazo por dentro no sirve de nada'));
  } finally {
    globalThis.fetch = fetchDeVerdad;
  }

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
