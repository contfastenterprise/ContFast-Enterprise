/**
 * Lote 262 -- en Productos, guardar la tasa del dolar tambien aplica los precios.
 *
 * Pedido del dueño (2026-10-03): *"haz que en productos tambien se aplique al guardar la tasa"*.
 * Salio de una pregunta: *"por que el costo en peso no cambia al aplicar la tasa"*. Medido en
 * PRODUCCION (solo lectura): la aplicacion SI cambio el costo de los 34 productos; lo que confundia
 * es que en Productos guardar la tasa no aplicaba nada hasta pulsar "Aplicar precios".
 *
 * QUE SE COMPRUEBA
 *  1. La accion del hook, EJECUTADA contra un `fetch` sustituido: guardar manda `aplicar: true`,
 *     el aviso dice cuantos precios cambiaron (lo que contesta el servidor) y la lista se recarga.
 *  2. Lo que se ve, DIBUJADO: el boton dice que aplica, y una linea lo explica.
 *  3. El texto de la pantalla ya no promete "Nada cambia solo".
 * Y como INVARIANTE: "Aplicar precios" sigue (para reaplicar tras cambiar un costo en dolares).
 *
 * Se ejecuta con: npx tsx scratch/verificar_productos_aplica_al_guardar.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const DIR = 'src/app/dashboard/products';

async function main() {
  //  Valen en los dos estados.
  if (!existsSync(resolve(raiz, `${DIR}/hooks/usePreciosEnDolares.ts`))) throw new Error('Precondicion: no esta el hook de precios en dolares');
  if (!existsSync(resolve(raiz, `${DIR}/components/TasaDelDia.tsx`))) throw new Error('Precondicion: no esta el componente de la tasa');

  const [React, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);
  //  `require` y no `import()`: el hook, transpilado por tsx, carga la version CommonJS de sonner, y un
  //  `import()` daria la ESM -- otro objeto, y los avisos no se verian (lote 230).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner');
  const avisos: string[] = [];
  (toast as AnyRec).error = (m: string) => { avisos.push(`error:${m}`); return 0; };
  (toast as AnyRec).success = (m: string) => { avisos.push(`bien:${m}`); return 0; };

  const DATOS = { tasa: { fecha: '2026-10-03', tasa: 61 }, historial: [], hoy: '2026-10-03', puedeAplicar: true, renglones: [] };
  const pedidos: { metodo: string; url: string; cuerpo: AnyRec | null }[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    pedidos.push({ metodo, url: String(u), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
    if (metodo === 'PUT') return json(200, { success: true, data: { tasa: { fecha: '2026-10-03', tasa: 63.5 }, aplicados: 2, atados: 34 } });
    return json(200, { success: true, data: DATOS });
  }) as typeof fetch;

  console.log('\n1) Guardar la tasa, ejecutado\n');
  const mod = (await import('../src/app/dashboard/products/hooks/usePreciosEnDolares')) as AnyRec;
  let h: AnyRec = {};
  renderToStaticMarkup(React.createElement(() => { h = mod.usePreciosEnDolares(); return null; }));
  await h.guardarTasa('63,50');
  const put = pedidos.find((p) => p.metodo === 'PUT');
  ok('guardar manda la tasa CON `aplicar: true` a la ruta de la tasa',
    !!put && /\/api\/v1\/products\/dolar\/tasa$/.test(put.url) && put.cuerpo?.aplicar === true && put.cuerpo?.tasa === '63,50',
    JSON.stringify(put));
  ok('  el aviso dice cuantos precios cambiaron, con lo que contesta el servidor',
    avisos.includes('bien:Tasa guardada: RD$ 63.50 por dólar. 2 productos cambiaron de precio.'), avisos.join(' | '));
  invariante('  y despues se recarga la lista (los importes nuevos los da el servidor)',
    pedidos.findIndex((p) => p.metodo === 'PUT') < pedidos.length - 1 && pedidos[pedidos.length - 1].metodo === 'GET');

  console.log('\n2) Lo que se ve, dibujado\n');
  const tasaDia = (await import('../src/app/dashboard/products/components/TasaDelDia')) as AnyRec;
  const html = renderToStaticMarkup(React.createElement(tasaDia.TasaDelDia,
    { tasa: { fecha: '2026-10-03', tasa: 61 }, historial: [], hoy: '2026-10-03', puedeEscribir: true, ocupado: false, alGuardar: async () => true }));
  ok('el boton dice que aplica los precios', />\s*Guardar y aplicar precios\s*<\/button>/.test(html) && !/>\s*Guardar tasa\s*<\/button>/.test(html));
  ok('  y una linea explica que se actualizan el costo y los precios de todos',
    html.includes('Al guardarla se actualizan el costo y los precios de todos los productos en dólares.'));

  console.log('\n3) La pantalla ya no promete lo contrario\n');
  const pantalla = sinComentarios(leer(`${DIR}/components/PreciosEnDolares.tsx`));
  ok('el texto de "Precios en dolares" dice que guardar la tasa aplica (y ya no "Nada cambia solo")',
    /al guardarla se aplican los precios de todos los productos en dólares/.test(pantalla) && !/Nada cambia solo/.test(pantalla));
  invariante('"Aplicar precios" sigue, para reaplicar tras cambiar un costo o precio en dolares',
    /onClick=\{confirmarYAplicar\}/.test(pantalla) && />\s*Aplicar precios\s*</.test(pantalla));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
