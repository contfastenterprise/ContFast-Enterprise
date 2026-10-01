/**
 * Lote 236 -- las advertencias de React Doctor de la portada de la tienda,
 * cerradas. Pedido del dueño tras el lote 235.
 *
 * Eran cuatro en la tarjeta de Configuracion > Tienda:
 *
 *  · "Guardar portada" sin guarda de re-entrada: dos clics seguidos mandaban
 *    dos PUT (la guarda miraba el ESTADO, que no ha cambiado todavia cuando
 *    llega el segundo clic). Ahora es un `useRef`;
 *  · la portada se pedia en un efecto al montar la tarjeta. Ahora se pide al
 *    PULSAR la pestana, y el estado vive en un hook que crea la pagina: lo
 *    escrito sin guardar sobrevive a cambiar de pestana, y un fallo de carga
 *    se puede reintentar (antes habia que salir y volver a entrar);
 *  · la tarjeta, partida: hook + campos + imagen.
 *
 * El banco EJECUTA las acciones del hook contra un `fetch` sustituido (se
 * capturan dibujando en el servidor un componente que solo lo llama, como en
 * el lote 230) y DIBUJA la tarjeta en sus tres estados.
 *
 * Lo que NO cierra, a proposito: los `<img>` de la tienda (la regla pide
 * `next/image`). Toda la tienda usa `<img>` (P3-47 del backlog), y pasar a
 * `next/image` es configuracion y consumo de la optimizacion de Vercel: una
 * decision, no un arreglo.
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const DIR = 'src/app/dashboard/settings';
const TARJETA = `${DIR}/components/PortadaDeLaTienda.tsx`;
const PIEZAS = [TARJETA, `${DIR}/components/CamposDeLaPortada.tsx`, `${DIR}/components/ImagenDeLaPortada.tsx`, `${DIR}/hooks/usePortadaDeLaTienda.ts`];
/** La tarjeta tal como quedo en el lote 235, antes de partirla; y el commit del 236, ya partida. */
const ANTES = 'd31b8d8';
const DESPUES = '88ac3c8';

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fn = (p: unknown) => unknown;

const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
const paginaDeError = () => new Response('<html><body>Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
const PORTADA = { anuncio: 'Abrimos sábados', titulo: 'Puertas a medida', texto: null, imagenUrl: null };
const DATOS = { portada: PORTADA, porDefecto: { titulo: 'Bienvenido a Latin Doors', texto: 'Texto de siempre.' }, tienda: '/latin-doors' };

/** Cada <label for="x"> tiene su id="x", y no hay etiquetas sueltas. */
function etiquetas(html: string) {
  const labels = [...html.matchAll(/<label\b[^>]*>/g)].map((m) => m[0]);
  const sueltas = labels.filter((l) => !/\bfor="[^"]+"/.test(l)).length;
  const huerfanas = labels.map((l) => /\bfor="([^"]+)"/.exec(l)?.[1]).filter((f): f is string => !!f)
    .filter((f) => !new RegExp(`\\bid="${f}"`).test(html));
  return { total: labels.length, sueltas, huerfanas };
}

//  Un banco que se queda sin nada que esperar ANTES de terminar sale con 0 sin
//  haber comprobado el resto: eso se parece demasiado a un verde.
let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

async function main() {
  //  Vale en los dos estados: la pestana "Tienda" del lote 235.
  const pagina = sinComentarios(leer(`${DIR}/page.tsx`));
  if (!/activeTab === 'tienda'/.test(pagina) || !leer(TARJETA)) throw new Error('Precondicion: no existe la pestana Tienda con su tarjeta (lote 235)');

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');

  //  `require` y no `import()`: el hook, transpilado por tsx, carga la version
  //  CommonJS de sonner y un `import()` daria la ESM, otro objeto (lote 230).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner');
  const avisos: string[] = [];
  (toast as AnyRec).error = (m: string) => { avisos.push(`error:${m}`); return 0; };
  (toast as AnyRec).success = (m: string) => { avisos.push(`bien:${m}`); return 0; };

  const fetchDeVerdad = globalThis.fetch;
  let pedidos: string[] = [];
  let responder: (metodo: string) => Promise<Response> = async () => json(200, { success: true, data: DATOS });
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    pedidos.push(metodo);
    return responder(metodo);
  }) as typeof fetch;

  console.log('\n1) Las acciones de la portada, ejecutadas\n');
  let usar: (() => AnyRec) | null = null;
  try { usar = ((await import('../src/app/dashboard/settings/hooks/usePortadaDeLaTienda')) as AnyRec).usePortadaDeLaTienda ?? null; } catch { usar = null; }
  const E1 = ['una vez cargada, la portada NO se vuelve a pedir (no pisa lo escrito sin guardar)', 'dos pulsaciones seguidas de la pestana piden la portada UNA vez',
    'si la carga falla, se puede reintentar', 'dos clics seguidos en "Guardar portada" mandan UN solo PUT', '  y al terminar se puede volver a guardar',
    'un 502 con pagina de error al guardar se dice con palabras, no con el error del analizador'];
  if (!usar) falta(E1, 'no existe hooks/usePortadaDeLaTienda.ts');
  else {
    const u = usar;
    /** Un hook nuevo cada vez: sus guardas son `useRef`, viven con la instancia. */
    const nuevo = (): AnyRec => { let h: AnyRec = {}; renderToStaticMarkup(React.createElement(() => { h = u(); return null; })); return h; };
    const intenta = async (t: string, f: () => Promise<[boolean, string]>) => {
      try { const [c, d] = await f(); ok(t, c, d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
    };

    await intenta(E1[0], async () => {
      const h = nuevo(); pedidos = [];
      await h.cargar(); await h.cargar();
      return [pedidos.join(',') === 'GET', pedidos.join(',')];
    });
    await intenta(E1[1], async () => {
      const h = nuevo(); pedidos = [];
      await Promise.all([h.cargar(), h.cargar()]);
      return [pedidos.join(',') === 'GET', pedidos.join(',')];
    });
    await intenta(E1[2], async () => {
      const h = nuevo(); pedidos = [];
      responder = async () => paginaDeError();
      await h.cargar();
      responder = async () => json(200, { success: true, data: DATOS });
      await h.cargar(); await h.cargar();
      return [pedidos.join(',') === 'GET,GET', pedidos.join(',')];
    });

    //  Se sueltan TODAS las peticiones en vuelo: si hubiera dos y solo se soltara la ultima,
    //  la primera quedaria colgada para siempre y el banco se apagaria sin decir nada.
    const enEspera: Array<() => void> = [];
    const soltar = () => { for (const s of enEspera.splice(0)) s(); };
    const lento = () => new Promise<Response>((r) => { enEspera.push(() => r(json(200, { success: true, data: { portada: PORTADA } }))); });
    const h = nuevo();
    await intenta(E1[3], async () => {
      pedidos = []; avisos.length = 0;
      responder = lento;
      const a = h.guardar(); const b = h.guardar();
      await new Promise((r) => setTimeout(r, 20));
      const enVuelo = pedidos.join(',');
      soltar(); await Promise.all([a, b]);
      return [enVuelo === 'PUT' && pedidos.join(',') === 'PUT' && avisos.filter((x) => x.startsWith('bien:')).length === 1, `${pedidos.join(',')} | ${avisos.join(' · ')}`];
    });
    await intenta(E1[4], async () => {
      pedidos = [];
      responder = async () => json(200, { success: true, data: { portada: PORTADA } });
      await h.guardar();
      return [pedidos.join(',') === 'PUT', pedidos.join(',')];
    });
    await intenta(E1[5], async () => {
      avisos.length = 0;
      responder = async () => paginaDeError();
      await nuevo().guardar();
      return [avisos.join('|') === 'error:No se pudo guardar la portada.', avisos.join('|')];
    });
  }
  globalThis.fetch = fetchDeVerdad;

  console.log('\n2) La tarjeta, dibujada en sus tres estados\n');
  let Tarjeta: Fn | null = null;
  try { Tarjeta = ((await import('../src/app/dashboard/settings/components/PortadaDeLaTienda')) as unknown as Record<string, Fn>).PortadaDeLaTienda ?? null; } catch { Tarjeta = null; }
  const nada = () => {};
  const base = { datos: null, errorDeCarga: null, f: { anuncio: '', titulo: '', texto: '', imagenUrl: '' }, guardando: false, subiendo: false, pasaDelTope: false,
    cargar: nada, cambiar: nada, subir: async () => {}, guardar: nada };
  const dibujar = (p: object) => { try { return renderToStaticMarkup(React.createElement(Tarjeta as never, { portada: { ...base, ...p } })); } catch (e) { return `LANZO ${(e as Error).message}`; } };
  const E2 = ['mientras carga lo dice; si falla, dice el motivo y ofrece Reintentar (sin formulario)', 'cargada: lo escrito, el ejemplo de cada campo y el enlace a la tienda',
    '  cada etiqueta apunta a su campo', 'pasado el tope, o mientras guarda o sube, no se puede guardar'];
  if (!Tarjeta) falta(E2, 'no existe la tarjeta');
  else {
    const cargando = dibujar({});
    const fallo = dibujar({ errorDeCarga: 'Sin permiso.' });
    ok(E2[0], /Cargando la portada/.test(cargando) && !/<input/.test(cargando)
      && /role="alert"[^>]*>.*Sin permiso\..*<button type="button"[^>]*>Reintentar<\/button>/.test(fallo) && !/<input/.test(fallo) && !/Cargando/.test(fallo));
    const lleno = { datos: DATOS, f: { anuncio: 'Abrimos sábados', titulo: '', texto: 'Dos\nlíneas', imagenUrl: 'https://x/portada.webp' } };
    const con = dibujar(lleno);
    ok(E2[1], /id="portada-anuncio"[^>]*value="Abrimos sábados"/.test(con) && /id="portada-titulo"[^>]*placeholder="Bienvenido a Latin Doors"/.test(con)
      && /<textarea[^>]*placeholder="Texto de siempre\."[^>]*>Dos\nlíneas<\/textarea>/.test(con) && /href="\/latin-doors"/.test(con)
      && /src="https:\/\/x\/portada\.webp"/.test(con) && />Cambiar</.test(con) && /Quitar/.test(con) && />15 \/ 120</.test(con));
    const e = etiquetas(con);
    ok(E2[2], e.total === 3 && e.sueltas === 0 && e.huerfanas.length === 0 && /aria-labelledby="etiqueta-portada-imagen"/.test(con) && /id="etiqueta-portada-imagen"/.test(con),
      `${e.total} etiquetas, ${e.sueltas} sueltas, huerfanas: ${e.huerfanas.join(',') || '-'}`);
    //  Se mira la etiqueta del PROPIO boton: una expresion que empiece en cualquier <button> inactivo
    //  salta desde "Quitar" (inactivo mientras se sube) hasta el texto de este.
    const guardarInactivo = (html: string) => {
      const i = html.indexOf('Guardar portada');
      const etiqueta = i < 0 ? '' : html.slice(html.lastIndexOf('<button', i), html.indexOf('>', html.lastIndexOf('<button', i)) + 1);
      return /^<button type="button" disabled=""/.test(etiqueta);
    };
    ok(E2[3], !guardarInactivo(con) && /Guardar portada<\/button>/.test(con) && guardarInactivo(dibujar({ ...lleno, pasaDelTope: true }))
      && guardarInactivo(dibujar({ ...lleno, guardando: true })) && guardarInactivo(dibujar({ ...lleno, subiendo: true })));
  }

  console.log('\n3) Como esta enchufada\n');
  ok('la portada se pide al PULSAR la pestana, y el estado es de la pagina',
    /const portada = usePortadaDeLaTienda\(\);/.test(pagina) && /onClick=\{\(\) => \{ setActiveTab\('tienda'\); void portada\.cargar\(\); \}\}/.test(pagina)
    && /<PortadaDeLaTienda portada=\{portada\} \/>/.test(pagina));
  ok('  y "Reintentar" vuelve a pedirla', /<button type="button" onClick=\{p\.cargar\}[^>]*>Reintentar<\/button>/.test(sinComentarios(leer(TARJETA))));
  const hook = sinComentarios(leer(PIEZAS[3]));
  const piezasDeVista = PIEZAS.slice(0, 3).map((p) => sinComentarios(leer(p)));
  ok('  ningun efecto pide datos: ni el hook ni las piezas usan useEffect, y las piezas no llaman a la red',
    hook.length > 0 && !/\buseEffect\b/.test(hook) && piezasDeVista.every((p) => p.length > 0 && !/\buseEffect\b/.test(p) && !/\bfetch\(/.test(p)));
  const guardar = (() => { const i = hook.indexOf('const guardar ='); return i < 0 ? '' : hook.slice(i, hook.indexOf('const pasaDelTope', i)); })();
  const subir = (() => { const i = hook.indexOf('const subir ='); return i < 0 ? '' : hook.slice(i, hook.indexOf('const guardar =', i)); })();
  ok('  subir la imagen lleva su propia guarda, tambien en un ref, y la suelta al terminar',
    /if \(!file \|\| subiendoYa\.current\) return;/.test(subir) && /finally \{\s*subiendoYa\.current = false;/.test(subir) && /guardandoYa\.current = false;/.test(guardar));
  const lineas = (p: string) => leer(p).split(/\r?\n/).length;
  ok('  y ninguna pieza pasa de 130 lineas', PIEZAS.every((p) => lineas(p) > 1 && lineas(p) <= 130) && !/\buseState\b/.test(piezasDeVista.join('\n')),
    PIEZAS.map((p) => `${p.split('/').pop()} ${lineas(p)}`).join(', '));

  console.log('\n4) Lo que se ve no cambio\n');
  //  Cierto antes y despues por definicion: como `ok()` regalaria un OK en la contraprueba.
  const deAntes = execSync(`git show ${ANTES}:${TARJETA}`, { cwd: raiz, encoding: 'utf8' });
  //  Se comparan los DOS COMMITS y no la carpeta (como en los lotes 227 y 230): lo que el 236 no
  //  cambio es un hecho de entonces. El 237 cambio a proposito la clase de la foto, y con la
  //  carpeta esta prueba se rompia sin que el 236 hubiera hecho nada.
  const deAhora = PIEZAS.map((f) => execSync(`git show ${DESPUES}:${f}`, { cwd: raiz, encoding: 'utf8' })).join('\n');
  const huella = (src: string) => [...new Set([
    ...[...src.matchAll(/className="([^"]+)"/g)].map((m) => `clase:${m[1]}`),
    ...[...src.matchAll(/placeholder="([^"]+)"/g)].map((m) => `ejemplo:${m[1]}`),
    ...[...src.matchAll(/toast\.(?:error|success)\('([^']+)'/g)].map((m) => `aviso:${m[1]}`),
    ...[...src.matchAll(/>\s*([A-ZÁÉÍÓÚa-záéíóúñ¿¡][^<>{}\n]{3,})\s*</g)].map((m) => `texto:${m[1].trim()}`),
  ])];
  const antes = huella(deAntes);
  //  La unica que cambia, a proposito: el aviso de fallo de carga gana el boton "Reintentar" y su fila.
  const A_PROPOSITO = ['clase:text-xs font-medium text-rose-600'];
  const perdidas = antes.filter((x) => !huella(deAhora).includes(x) && !A_PROPOSITO.includes(x));
  invariante(`las ${antes.length} clases, ejemplos, avisos y textos de la tarjeta del lote 235 siguen ahi`, antes.length > 30 && perdidas.length === 0, perdidas.join(' | '));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
