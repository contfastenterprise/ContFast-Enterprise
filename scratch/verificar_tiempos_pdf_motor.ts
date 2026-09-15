/**
 * Banco del lote 113: `[tiempos-pdf]` dice QUE dibujo el PDF, y cuanto costo
 * intentar el servicio externo.
 *
 *     pnpm exec tsx scratch/verificar_tiempos_pdf_motor.ts
 *
 * POR QUE
 * -------
 * El lote 105 dejo una linea `[tiempos-pdf] render` para decidir si la lentitud
 * de impresion es el arranque en frio de Chromium. Pero `dibujar` tiene TRES
 * caminos, no uno:
 *
 *   PDF_GENERATOR_MODE=external ........ solo el servicio externo
 *   PDF_SERVICE_URL (sin modo) ......... PRIMERO el externo, hasta 15 s, y si
 *                                        falla, Puppeteer
 *   nada ............................... Puppeteer
 *
 * Medido el 2026-09-14: en Vercel no hay PDF_GENERATOR_MODE, y el `.env` local
 * tiene PDF_SERVICE_URL=http://localhost:3000 -- la propia aplicacion, que no
 * es un Gotenberg. Si esa variable existe en Vercel, cada PDF intenta un
 * servicio que no convierte nada, espera a que falle y LUEGO dibuja. La linea
 * no lo decia: ese tiempo se sumaba a `total_ms` sin nombre, y `navegador`
 * decia `arrancado` aun cuando no se habia usado ningun navegador. Se habria
 * leido como "Chromium en frio" y se habria montado un Gotenberg para arreglar
 * un fallo de configuracion.
 *
 * AHORA la linea lleva `motor` (externo / local / local tras fallo del
 * externo) y `externo_ms`, y `navegador` dice `no se usa` cuando no se usa.
 *
 * SE EJECUTA, NO SE LEE
 * ---------------------
 * Con `fetch`, el navegador y `console.info` sustituidos: se llama de verdad a
 * `generatePdfFromHtml` por los tres caminos y se lee la linea que escribe.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const GEN = 'src/services/print/pdfGenerator.ts';
const codigo = sinComentarios(fs.readFileSync(GEN, 'utf8').replace(/\r\n/g, '\n'));

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(codigo.includes("Logger.info('[tiempos-pdf] render'"), 'la linea [tiempos-pdf] ya no existe');
exige(codigo.includes("const generatorMode = process.env.PDF_GENERATOR_MODE || 'local';"),
      'dibujar ya no lee PDF_GENERATOR_MODE');
exige(codigo.includes('if (pdfServiceUrl) {') && codigo.includes('Falling back to local Puppeteer'),
      'ya no existe el camino "externo y si falla, local": el motivo del lote cambia');
exige(codigo.includes('private static async getBrowser()'), 'getBrowser ya no existe: el doble del navegador no aplica');

type Linea = Record<string, unknown>;

async function main(): Promise<void> {
  const { PdfGenerator } = await import('../src/services/print/pdfGenerator');
  const G = PdfGenerator as unknown as Record<string, unknown>;

  // ── dobles ──────────────────────────────────────────────────────────────
  let navegadorPedido = 0;
  G.getBrowser = async function (this: Record<string, unknown>) {
    navegadorPedido++;
    this.ultimoArranqueEnCaliente = navegadorPedido > 1;
    return {
      newPage: async () => ({
        setContent: async () => undefined,
        evaluate: async () => 100,
        pdf: async () => new Uint8Array([37, 80, 68, 70, 45, 108]),
        close: async () => undefined,
      }),
    };
  };

  const fetchDeVerdad = globalThis.fetch;
  let peticiones = 0;
  let responder: () => Promise<Response> = async () => new Response(new Uint8Array([37, 80, 68, 70, 45, 101]), { status: 200 });
  globalThis.fetch = (async () => { peticiones++; return responder(); }) as typeof fetch;

  const infoDeVerdad = console.info;
  let lineas: Linea[] = [];
  console.info = (mensaje?: unknown, contexto?: unknown) => {
    if (mensaje === '[tiempos-pdf] render') lineas.push((contexto ?? {}) as Linea);
  };

  const warnDeVerdad = console.warn;
  const logDeVerdad = console.log;
  const silencio = () => undefined;

  async function render(env: { modo?: string; url?: string }): Promise<{ linea: Linea | undefined; pdf: Buffer | null }> {
    if (env.modo) process.env.PDF_GENERATOR_MODE = env.modo; else delete process.env.PDF_GENERATOR_MODE;
    if (env.url) process.env.PDF_SERVICE_URL = env.url; else delete process.env.PDF_SERVICE_URL;
    lineas = []; peticiones = 0;
    console.warn = silencio; console.log = silencio;
    let pdf: Buffer | null = null;
    try { pdf = await PdfGenerator.generatePdfFromHtml('<p>factura</p>', 'carta'); }
    catch { pdf = null; }
    finally { console.warn = warnDeVerdad; console.log = logDeVerdad; }
    return { linea: lineas[0], pdf };
  }
  const esNumero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

  try {
    // ───────────────────────────────────────────────────────────────────────
    console.log('A. SOLO EXTERNO (PDF_GENERATOR_MODE=external)');
    // ───────────────────────────────────────────────────────────────────────
    {
      navegadorPedido = 0;
      //  Con retraso: con uno instantaneo `externo_ms` salia 0, que tambien es
      //  "un numero", y no medirlo pasaba (mutante que sobrevivio).
      responder = async () => { await new Promise((r) => setTimeout(r, 40)); return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }); };
      const { linea, pdf } = await render({ modo: 'external', url: 'https://gotenberg.ejemplo.do' });
      ok('la linea dice motor: externo', linea?.motor === 'externo');
      ok('y navegador: no se usa (antes decia "arrancado" sin navegador)',
         linea?.navegador === 'no se usa' && navegadorPedido === 0 && pdf !== null);
      ok('con lo que tardo el externo', esNumero(linea?.externo_ms) && (linea?.externo_ms as number) >= 30);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('B. EXTERNO CON RED DE SEGURIDAD (solo PDF_SERVICE_URL)');
    // ───────────────────────────────────────────────────────────────────────
    {
      navegadorPedido = 0;
      responder = async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
      const { linea } = await render({ url: 'https://gotenberg.ejemplo.do' });
      ok('si el externo responde: motor externo, sin navegador',
         linea?.motor === 'externo' && linea?.navegador === 'no se usa' && navegadorPedido === 0);
    }
    {
      //  EL CASO QUE MOTIVA EL LOTE: el externo no sirve, se espera, y dibuja
      //  Puppeteer. El retraso simula lo que tarda en fallar.
      navegadorPedido = 0;
      responder = async () => { await new Promise((r) => setTimeout(r, 60)); return new Response('no', { status: 404 }); };
      const { linea, pdf } = await render({ url: 'http://localhost:3000' });
      ok('si el externo falla: motor "local tras fallo del externo"',
         linea?.motor === 'local tras fallo del externo' && navegadorPedido === 1 && pdf !== null);
      ok('y externo_ms recoge lo que se perdio esperando', esNumero(linea?.externo_ms) && (linea?.externo_ms as number) >= 50);
      //  Atado a `motor`: sin el, `navegador` ya decia arrancado/caliente antes
      //  del lote y la comprobacion regalaba un OK en la contraprueba.
      ok('y navegador vuelve a significar algo',
         linea?.motor === 'local tras fallo del externo'
         && (linea?.navegador === 'arrancado' || linea?.navegador === 'caliente'));
      ok('total_ms incluye esa espera', esNumero(linea?.total_ms) && (linea?.total_ms as number) >= (linea?.externo_ms as number));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log('C. SIN SERVICIO EXTERNO');
    // ───────────────────────────────────────────────────────────────────────
    {
      navegadorPedido = 0;
      const { linea, pdf } = await render({});
      ok('motor local, sin tocar la red', linea?.motor === 'local' && peticiones === 0 && pdf !== null);
      ok('externo_ms en cero', linea?.externo_ms === 0);
    }
    {
      const { linea } = await render({});
      //  Igual: atado a `motor`, o era cierto antes del lote.
      ok('la segunda con el navegador ya arrancado dice caliente',
         linea?.motor === 'local' && linea?.navegador === 'caliente');
    }
  } finally {
    globalThis.fetch = fetchDeVerdad;
    console.info = infoDeVerdad;
    console.warn = warnDeVerdad;
    console.log = logDeVerdad;
  }

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
