/**
 * Lote 247 -- precios atados al dolar.
 *
 * Pedido del dueño (2026-10-02): "la mayoria de los productos se compran en
 * dolares, pero la tasa a peso dominicano varia constantemente". Sus cuatro
 * decisiones: una tasa PROPIA, que escribe el cada dia; un costo en dolares
 * fijado POR PRODUCTO; y los precios se aplican CON SU CONFIRMACION.
 *
 * El banco EJECUTA las reglas (`services/precios/preciosEnDolares.ts`), las
 * acciones del hook contra un `fetch` sustituido, y DIBUJA la tabla y la tasa.
 * Lo que solo se puede ver contra la base (la transaccion, el bloqueo, el
 * registro de cambios) lo comprueba `verificar_precios_en_dolares_db.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const DIR = 'src/app/dashboard/products';
const RUTAS = {
  lista: 'src/app/api/v1/products/dolar/route.ts',
  tasa: 'src/app/api/v1/products/dolar/tasa/route.ts',
  aplicar: 'src/app/api/v1/products/dolar/aplicar/route.ts',
};

let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

/** Un handler exportado de una ruta, hasta el siguiente `export`. */
function handler(src: string, metodo: string): string {
  const i = src.indexOf(`export async function ${metodo}(`);
  if (i < 0) return '';
  const j = src.indexOf('export async function', i + 1);
  return src.slice(i, j < 0 ? undefined : j);
}

async function main() {
  //  Precondicion, cierta en los dos estados: el catalogo y su lista de siempre.
  const pagina = sinComentarios(leer(`${DIR}/page.tsx`));
  if (!/<PestanasDeRegistro\b/.test(pagina) || !/\bconst\s+formatCurrency\b/.test(pagina)) {
    throw new Error('Precondicion: la pagina de productos no es la de los lotes 240-242');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Las reglas, ejecutadas\n');
  // ───────────────────────────────────────────────────────────────────────────
  let r: AnyRec | null = null;
  try { r = (await import('../src/services/precios/preciosEnDolares')) as AnyRec; } catch { r = null; }
  const E1 = [
    'la tasa se lee con coma o punto decimal, hasta cuatro decimales',
    'una tasa en cero, negativa, de texto o de mas de 1.000 pesos se rechaza',
    'el costo pasa a costo en dolares x tasa, redondeado al centavo',
    'cada precio CONSERVA su margen sobre el costo anterior',
    'un nivel de precio en cero se queda en cero (no se le inventa precio)',
    'sin costo anterior, los precios salen con los margenes de fabrica (y lo dice)',
    'aplicar dos veces la misma tasa no cambia nada',
    'avisa si el precio de oferta queda por debajo del costo nuevo, sin tocarla',
    'la confirmacion vale solo para la tasa que se vio',
    'la variacion del precio base, en porcentaje',
    'la tasa se ensena con dos decimales al menos, y lo ensenado se puede volver a escribir',
  ];
  if (!r) falta(E1, 'no existe services/precios/preciosEnDolares.ts');
  else {
    const t = (v: unknown) => r!.leerTasa(v);
    ok(E1[0], t('63,50').valor === 63.5 && t(' 63.5 ').valor === 63.5 && t('63.123456').valor === 63.1235 && t(60).valor === 60,
      JSON.stringify([t('63,50'), t('63.123456')]));
    ok(E1[1], ['0', '-1', 'abc', '1500', '', null, '63.5.1'].every((v) => !t(v).bien) && t('1000').bien,
      JSON.stringify(['0', '-1', 'abc', '1500'].map(t)));

    const base = { costoUsd: 2, cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 };
    const c = r.calcular(base, 60.005);
    //  3,3333 x 63,5 = 211,664...: sin redondear, el costo guardaria milesimas.
    const fino = r.calcular({ ...base, costoUsd: 3.3333 }, 63.5).despues.cost;
    ok(E1[2], c.despues.cost === 120.01 && fino === 211.66, `costo ${c.despues.cost} y ${fino}`);
    ok(E1[3], c.despues.price === 156.01 && c.despues.priceConsumidor === 144.01 && c.despues.priceProveedor === 132.01,
      JSON.stringify(c.despues));
    ok(E1[4], c.despues.priceMayorista === 0, `mayorista ${c.despues.priceMayorista}`);

    const sinCosto = r.calcular({ ...base, cost: 0 }, 50);
    ok(E1[5], sinCosto.despues.cost === 100 && sinCosto.despues.price === 125 && sinCosto.despues.priceConsumidor === 120 &&
      sinCosto.despues.priceMayorista === 115 && sinCosto.despues.priceProveedor === 110 && sinCosto.avisos.some((a: string) => /fábrica/.test(a)),
      JSON.stringify(sinCosto.despues));

    const una = r.calcular(base, 61);
    const dos = r.calcular({ ...base, ...una.despues }, 61);
    ok(E1[6], una.cambia === true && dos.cambia === false, `primera ${una.cambia}, segunda ${dos.cambia}`);

    const conOferta = r.calcular({ ...base, oferta: 115 }, 60);
    const ofertaBien = r.calcular({ ...base, oferta: 125 }, 60);
    ok(E1[7], conOferta.avisos.some((a: string) => /oferta/.test(a)) && !ofertaBien.avisos.some((a: string) => /oferta/.test(a)) &&
      !('promotionalPrice' in conOferta.despues), JSON.stringify(conOferta.avisos));

    ok(E1[8], r.mismaTasa('63.50', 63.5) && r.mismaTasa(63.5, 63.5) && !r.mismaTasa(63.51, 63.5) && !r.mismaTasa(undefined, 63.5),
      'misma, distinta y sin tasa');
    //  Vale antes y despues por definicion de "se puede volver a escribir": lo que se ensena, leido, da lo mismo.
    const idaYVuelta = [63.5, 63, 63.1235, 1000, 0.5].every((n) => r!.leerTasa(r!.escribirTasa(n)).valor === n);
    ok(E1[10],
      r.escribirTasa(63.5) === '63.50' && r.escribirTasa(63.1235) === '63.1235' && r.escribirTasa(1000) === '1000.00' && idaYVuelta,
      `${r.escribirTasa(63.5)} ${r.escribirTasa(1000)}`);
    ok(E1[9], r.variacion(c) === 20 && r.variacion(r.calcular({ ...base, price: 0 }, 60)) === null, String(r.variacion(c)));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) Las rutas: quien escribe y que se aplica\n');
  // ───────────────────────────────────────────────────────────────────────────
  const lista = sinComentarios(leer(RUTAS.lista));
  const tasa = sinComentarios(leer(RUTAS.tasa));
  const aplicar = sinComentarios(leer(RUTAS.aplicar));
  const soloAdmin = (h: string) => /enforcePermission\([^)]*'catalogo',\s*'write'\)/.test(h) && /if \(!esAdminOSistemas\(auth\.role\)\) return soloAdministracion\(\);/.test(h);
  ok('escribir la tasa, atar, soltar y aplicar son de administracion',
    [handler(lista, 'PUT'), handler(lista, 'DELETE'), handler(tasa, 'PUT'), handler(aplicar, 'POST')].every(soloAdmin));
  ok('  y ver la lista pide solo el permiso de ver el catalogo',
    /'catalogo',\s*'read'/.test(handler(lista, 'GET')) && !/esAdminOSistemas\(auth\.role\)\) return/.test(handler(lista, 'GET')));
  const post = handler(aplicar, 'POST');
  ok('aplicar NO toma importes del cuerpo: los calcula el servidor con la tasa vigente',
    /\.aplicar\(auth\.companyId, auth\.userId, cuerpo\?\.tasa, /.test(post) && !/cuerpo\??\.(precios|importes|cost|price)/.test(post));
  ok('el dia de la tasa lo pone el servidor, y es el de RD', /guardarTasa\(auth\.companyId, diaRD\(\),/.test(handler(tasa, 'PUT')));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Las acciones de la pantalla, ejecutadas\n');
  // ───────────────────────────────────────────────────────────────────────────
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner');
  const avisos: string[] = [];
  (toast as AnyRec).error = (m: string) => { avisos.push(`error:${m}`); return 0; };
  (toast as AnyRec).success = (m: string) => { avisos.push(`bien:${m}`); return 0; };

  const renglon = (id: string, cambia: boolean) => ({
    productId: id, sku: null, name: `P-${id}`, costoUsd: 2, tasaAplicada: null,
    actual: { cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 },
    calculo: { antes: {}, despues: {}, cambia, avisos: [] },
  });
  const DATOS = {
    tasa: { fecha: '2026-10-02', tasa: 63.5 }, historial: [], hoy: '2026-10-02', puedeAplicar: true,
    renglones: [renglon('a', true), renglon('b', false), renglon('c', true)],
  };
  let pedidos: { metodo: string; url: string; cuerpo: AnyRec | null }[] = [];
  let responder: (metodo: string) => Promise<Response> = async () => json(200, { success: true, data: DATOS });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    pedidos.push({ metodo: init?.method ?? 'GET', url: String(u), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
    return responder(init?.method ?? 'GET');
  }) as typeof fetch;

  let usar: (() => AnyRec) | null = null;
  try { usar = ((await import('../src/app/dashboard/products/hooks/usePreciosEnDolares')) as AnyRec).usePreciosEnDolares ?? null; } catch { usar = null; }
  const E3 = [
    'al cargar quedan marcados SOLO los productos cuyo precio cambia',
    'aplicar manda la tasa que se vio y los marcados, y nada mas (y luego recarga)',
    'dos clics seguidos en "Aplicar precios" mandan UN solo POST',
    'si la tasa cambio por el camino, se dice el motivo del servidor',
  ];
  if (!usar) falta(E3, 'no existe hooks/usePreciosEnDolares.ts');
  else {
    const u = usar;
    //  El hook se dibuja de nuevo tras cada accion para leer su estado: guardas y estado viven en un componente
    //  montado con un "almacen" propio, porque renderToStaticMarkup no vuelve a pintar.
    const capturar = (): AnyRec => { let h: AnyRec = {}; renderToStaticMarkup(React.createElement(() => { h = u(); return null; })); return h; };
    const intenta = async (t: string, f: () => Promise<[boolean, string]>) => {
      try { const [c, d] = await f(); ok(t, c, d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
    };

    //  Sin re-render no se ve el estado nuevo; se captura lo que el hook manda al servidor.
    await intenta(E3[0], async () => {
      //  `marcados` se fija al cargar; con un hook sin re-render se comprueba lo que mandaria
      //  `aplicar` con ese estado: se simula con la regla exportada del propio hook.
      const mod = (await import('../src/app/dashboard/products/hooks/usePreciosEnDolares')) as AnyRec;
      const marcadosAlCargar = mod.losQueCambian ? mod.losQueCambian(DATOS.renglones) : null;
      return [JSON.stringify(marcadosAlCargar) === '["a","c"]', JSON.stringify(marcadosAlCargar)];
    });

    await intenta(E3[1], async () => {
      const h = capturar(); pedidos = [];
      await h.aplicarCon(DATOS.tasa, ['a', 'c']);
      const p = pedidos[0];
      //  Tras aplicar se vuelve a pedir la lista (los importes nuevos los da el servidor): un POST y nada mas que lo cargue.
      return [pedidos.filter((x) => x.metodo === 'POST').length === 1 && p.metodo === 'POST' && /\/aplicar$/.test(p.url) &&
        JSON.stringify(p.cuerpo) === JSON.stringify({ tasa: 63.5, productos: ['a', 'c'] }) && pedidos.slice(1).every((x) => x.metodo === 'GET'), JSON.stringify(pedidos)];
    });

    const enEspera: Array<() => void> = [];
    await intenta(E3[2], async () => {
      const h = capturar(); pedidos = [];
      responder = (m) => (m === 'POST'
        ? new Promise<Response>((res) => { enEspera.push(() => res(json(200, { success: true, data: { aplicados: 2 } }))); })
        : Promise.resolve(json(200, { success: true, data: DATOS })));
      const a = h.aplicarCon(DATOS.tasa, ['a']); const b = h.aplicarCon(DATOS.tasa, ['a']);
      await new Promise((res) => setTimeout(res, 20));
      for (const s of enEspera.splice(0)) s();
      await Promise.all([a, b]);
      const posts = pedidos.filter((p) => p.metodo === 'POST').length;
      return [posts === 1, `${posts} POST`];
    });

    await intenta(E3[3], async () => {
      const h = capturar(); avisos.length = 0;
      responder = async () => json(409, { success: false, error: { message: 'La tasa cambió mientras revisabas los precios.' } });
      await h.aplicarCon(DATOS.tasa, ['a']);
      return [avisos.some((a) => /^error:La tasa cambió/.test(a)), avisos.join(' | ')];
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Lo que se ve, dibujado\n');
  // ───────────────────────────────────────────────────────────────────────────
  let tabla: AnyRec | null = null;
  let tasaDia: AnyRec | null = null;
  try { tabla = (await import('../src/app/dashboard/products/components/TablaDePreciosEnDolares')) as AnyRec; } catch { tabla = null; }
  try { tasaDia = (await import('../src/app/dashboard/products/components/TasaDelDia')) as AnyRec; } catch { tasaDia = null; }
  const E4 = [
    'la tabla ensena el precio de hoy tachado y el nuevo al lado',
    'un producto que no cambia no se puede marcar',
    'cada casilla dice de que producto es',
    'sin tasa escrita, la pantalla lo dice',
    'quien no es administracion no ve el campo para escribir la tasa',
    'una tasa de dias atras dice cuantos lleva sin tocarse',
  ];
  if (!tabla || !tasaDia || !r) falta(E4, 'faltan los componentes de la pantalla');
  else {
    const calc = r.calcular({ costoUsd: 2, cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 }, 60);
    const actual = { cost: 100, price: 130, priceConsumidor: 120, priceMayorista: 0, priceProveedor: 110 };
    const renglones = [
      { productId: 'x', sku: 'PU-1', name: 'Puerta Roble', costoUsd: 2, tasaAplicada: null, actual, calculo: calc },
      { productId: 'y', sku: null, name: 'Dintel', costoUsd: 2, tasaAplicada: 60, actual: calc.despues, calculo: r.calcular({ costoUsd: 2, ...calc.despues }, 60) },
    ];
    const nada = () => undefined;
    const html = renderToStaticMarkup(React.createElement(tabla.TablaDePreciosEnDolares, {
      renglones, marcados: ['x'], puedeAplicar: true, ocupado: false,
      alMarcar: nada, alMarcarTodos: nada, alGuardarCosto: async () => true, alSoltar: nada,
    }));
    ok(E4[0], /line-through[^>]*>130\.00<\/span> <span[^>]*>156\.00</.test(html), (/Puerta Roble[\s\S]{0,600}/.exec(html) ?? [''])[0].slice(0, 120));
    const casillaDintel = /<input[^>]*aria-label="Aplicar el precio nuevo a Dintel"[^>]*>/.exec(html)?.[0] ?? '';
    ok(E4[1], /\sdisabled=""/.test(casillaDintel), casillaDintel);
    ok(E4[2], /aria-label="Aplicar el precio nuevo a Puerta Roble"/.test(html) && /aria-label="Marcar todos los productos que cambian"/.test(html));

    const tasaHtml = (props: AnyRec) => renderToStaticMarkup(React.createElement(tasaDia!.TasaDelDia,
      { historial: [], hoy: '2026-10-02', ocupado: false, alGuardar: async () => true, ...props }));
    ok(E4[3], /Todavía no has escrito ninguna tasa/.test(tasaHtml({ tasa: null, puedeEscribir: true })));
    const sinPermiso = tasaHtml({ tasa: { fecha: '2026-10-02', tasa: 63.5 }, puedeEscribir: false });
    ok(E4[4], !/id="tasa-de-hoy"/.test(sinPermiso) && /La tasa la escribe administración/.test(sinPermiso) &&
      /id="tasa-de-hoy"/.test(tasaHtml({ tasa: null, puedeEscribir: true })));
    ok(E4[5], /lleva 3 días sin tocarse/.test(tasaHtml({ tasa: { fecha: '2026-09-29', tasa: 63.5 }, puedeEscribir: true })) &&
      /Es la de hoy/.test(tasaHtml({ tasa: { fecha: '2026-10-02', tasa: 63.5 }, puedeEscribir: true })));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) La pagina de productos\n');
  // ───────────────────────────────────────────────────────────────────────────
  const hook = sinComentarios(leer(`${DIR}/hooks/usePreciosEnDolares.ts`));
  //  Abrir la pantalla la carga en la misma pulsacion (no en un efecto al montar).
  const abreYCarga = /const abrir = useCallback\(\(\) => \{ setAbierta\(true\); void cargar\(\); \}/.test(hook) && !/useEffect/.test(hook);
  ok('el boton "Precios en dolares" vive en la barra de la lista, no junto a las pestanas, y al pulsarlo carga',
    /onClick=\{dolar\.abrir\}/.test(pagina) && abreYCarga &&
    pagina.indexOf('Precios en dólares') > pagina.indexOf('<SearchBar'));
  ok('mientras se ven los precios en dolares, la lista no se pinta', /\{!showModal && !enDolar && \(<>/.test(pagina) &&
    /\{!showModal && enDolar && \(\s*<PreciosEnDolares d=\{dolar\}/.test(pagina));
  ok('al volver, el catalogo se vuelve a pedir (puede tener precios nuevos)',
    /alVolver=\{\(\) => \{ dolar\.cerrar\(\); fetchProducts\(search, selectedCategory, page\); \}\}/.test(pagina));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); terminado = true; process.exit(2); });
