/**
 * Lote 230 -- las advertencias de React Doctor de la pantalla de caja,
 * cerradas. Pedido del dueño tras partir la pagina (lote 229).
 *
 * Eran 43 en los ficheros de caja (las mismas que tenia la pagina vieja).
 * Medido despues con React Doctor en local: 0. Las que cambian comportamiento:
 *
 *  · las lecturas `await res.json()` antes de mirar el estado: todas pasan por
 *    `src/utils/leerRespuesta.ts` (lote 227). Con un 5xx que devuelve una pagina
 *    de error, `json()` lanzaba y el cajero leia "Unexpected token '<'..." en
 *    vez de "Error al abrir sesión."; y si la sesion activa no se podia leer
 *    (un 403, por ejemplo) la pantalla ofrecia ABRIR caja sin decir nada;
 *  · accesibilidad: cada etiqueta apunta a su campo, los botones de cerrar
 *    dicen que cierran y cada cantidad del arqueo dice de que denominacion es;
 *  · la hora del arqueo se toma una vez al abrir la pestaña (antes cambiaba en
 *    cada tecla del conteo), y el CSV exportado suelta su memoria.
 *
 * Sin efecto visible: `m` con `LazyMotion` en vez de `motion`, el formateador
 * de moneda creado una vez, las pestañas fuera del render y el historico
 * filtrado y pintado en una sola pasada.
 *
 * El banco EJECUTA las acciones de `useCaja` contra un `fetch` sustituido (se
 * capturan del hook al dibujar la pagina en el servidor) y DIBUJA las vistas
 * para comprobar en el HTML que cada `for` tiene su `id`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ficherosDePantallaDeCaja } from './pantallaDeCaja';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const DIR = 'src/app/dashboard/cash';
type Fn = (p: unknown) => unknown;
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Cada <label for="x"> tiene su id="x", y no hay etiquetas sueltas. */
function etiquetas(html: string) {
  const labels = [...html.matchAll(/<label\b[^>]*>/g)].map((m) => m[0]);
  const sueltas = labels.filter((l) => !/\bfor="[^"]+"/.test(l));
  const huerfanas = labels.map((l) => /\bfor="([^"]+)"/.exec(l)?.[1]).filter((f): f is string => !!f)
    .filter((f) => !new RegExp(`\\bid="${f}"`).test(html));
  return { total: labels.length, sueltas: sueltas.length, huerfanas };
}

async function main() {
  const pantalla = ficherosDePantallaDeCaja(raiz);
  if (pantalla.length < 10) throw new Error('Precondicion: la pantalla de caja no esta partida (lote 229)');

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const enrutador = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} };
  const dibujar = (C: Fn, props: object) => renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: enrutador as never }, React.createElement(C as never, props)));
  const cargar = async (n: string): Promise<Fn | null> => {
    try { return ((await import(`../src/app/dashboard/cash/components/${n}`)) as Record<string, Fn>)[n] ?? null; } catch { return null; }
  };

  //  Los avisos: se sustituye `toast` de sonner. Con `require` y no `import()`:
  //  el hook, transpilado por tsx, carga la version CommonJS del paquete, y un
  //  `import()` daria la ESM -- otro objeto, y los avisos no se verian nunca.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner');
  const avisos: string[] = [];
  (toast as AnyRec).error = (m: string) => { avisos.push(`error:${m}`); return 0; };
  (toast as AnyRec).success = (m: string) => { avisos.push(`bien:${m}`); return 0; };

  //  El hook, capturado al dibujar un componente que solo lo llama.
  const { useCaja } = await import('../src/app/dashboard/cash/hooks/useCaja');
  let caja: AnyRec = {};
  const { useHistorialCaja } = await import('../src/app/dashboard/cash/hooks/useHistorialCaja');
  let historial: AnyRec = {};
  const Captura = () => {
    caja = useCaja({ alAbrirHistorico: () => {} }) as AnyRec;
    historial = useHistorialCaja({ recargarCaja: async () => {} }) as AnyRec;
    return null;
  };
  renderToStaticMarkup(React.createElement(Captura));
  const conFetch = async (resp: (url: string) => Response, f: () => Promise<unknown>) => {
    const antes = globalThis.fetch;
    avisos.length = 0;
    globalThis.fetch = (async (u: string) => resp(String(u))) as typeof fetch;
    try { await f(); } catch (e) { avisos.push(`LANZO:${(e as Error).message}`); } finally { globalThis.fetch = antes; }
    return [...avisos];
  };
  const html502 = () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
  const json = (c: object, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
  const evento = { preventDefault: () => {} };

  console.log('\n1) Las respuestas se leen por su estado, ejecutado\n');
  //  Con los campos rellenos no se puede, porque el estado del hook no se
  //  cambia fuera del render; por eso se prueban las acciones que no exigen
  //  campos (la carga y el cierre) y una que si, para ver su guarda intacta.
  const a1 = await conFetch((u) => (u.includes('/active') ? json({ success: false, error: { message: 'Sin permiso para caja.' } }, 403) : json({ success: true, data: [] })),
    () => caja.loadCashData());
  ok('si la caja activa no se puede leer, se DICE (antes: pantalla de abrir caja, callada)',
    a1.includes('error:Sin permiso para caja.'), a1.join(' | '));
  //  Con un 502 de pagina de error: la carga de la caja ya lo decia bien (su
  //  `catch` ponia su propio texto), pero dar por revisada una diferencia pasaba
  //  el mensaje del `catch` tal cual, y ese era el del analizador de JSON.
  const a2 = await conFetch(() => html502(), () => historial.aprobarDiferencia('s1'));
  ok('  y con un 502 de pagina de error, el mensaje es nuestro, no el del analizador de JSON',
    a2.length === 1 && a2[0] === 'error:No se pudo aprobar.', a2.join(' | '));
  const a3 = await conFetch(() => json({ success: true, data: null }), () => caja.loadCashData());
  invariante('  sin caja abierta y sin fallo, no hay aviso (no se confunde "no hay" con "no se pudo")', a3.length === 0, a3.join(' | '));
  const a4 = await conFetch(() => json({ success: true, data: [] }), () => caja.handleOpenSession(evento));
  invariante('abrir caja sin campos sigue frenado por su guarda', a4.length === 1 && a4[0] === 'error:Complete todos los campos de apertura.', a4.join(' | '));

  console.log('\n2) Ninguna lectura por su cuenta\n');
  const hooks = ['hooks/useCaja.ts', 'hooks/useHistorialCaja.ts'].map((f) => sinComentarios(leer(`${DIR}/${f}`)));
  const fetches = hooks.reduce((n, h) => n + (h.match(/await fetch\(/g) ?? []).length, 0);
  const lecturas = hooks.reduce((n, h) => n + (h.match(/await leerRespuesta\b/g) ?? []).length, 0);
  ok('cada `await fetch(` de los hooks se lee con `leerRespuesta`',
    fetches >= 9 && lecturas >= fetches && hooks.every((h) => /import \{ leerRespuesta \} from '@\/utils\/leerRespuesta';/.test(h)),
    `${fetches} fetch, ${lecturas} lecturas`);
  ok('  y ninguna hace `.json()` a mano', hooks.every((h) => !/\.json\(\)/.test(h)) && lecturas > 0);

  console.log('\n3) Accesibilidad, en el HTML dibujado\n');
  const caja0 = {
    registers: [{ id: 'r', name: 'Caja 1' }], selectedRegisterId: 'r', initialBalance: '', submitting: false,
    showNewRegisterModal: true, newRegisterForm: { name: '', code: '' }, creatingRegister: false,
    showMoveModal: true, moveType: 'cash_in', moveAmount: '', moveDescription: '',
    denomQty: {}, closeObservations: '', closing: false, session: { id: 's', initialBalance: '0' },
    getCashTotal: () => 0, getRealBalance: () => 0,
  };
  const c = new Proxy(caja0, { get: (t, k) => (k in t ? (t as AnyRec)[k as string] : () => {}) });
  const [VA, MM, VAr, VH, MV] = await Promise.all(['VistaApertura', 'ModalMovimiento', 'VistaArqueo', 'VistaHistorico', 'ModalVerSesion'].map(cargar));
  const piezas: [string, Fn | null, object][] = [
    ['apertura y nueva terminal', VA, { c }], ['movimiento', MM, { c }], ['arqueo', VAr, { c }],
    ['historico', VH, { h: { history: [], histStatus: '', histDateFrom: '', aprobando: null, errorCarga: null,
      aprobarDiferencia: () => {}, handleExportHistory: () => {}, loadHistory: () => {}, setHistDateFrom: () => {},
      setHistStatus: () => {}, setSelectedSession: () => {}, setShowViewModal: () => {} } }],
  ];
  const htmls: Record<string, string> = {};
  for (const [n, C, p] of piezas) {
    if (!C) { ok(`${n}: cada etiqueta apunta a su campo`, false, 'no se pudo cargar'); continue; }
    let html = '';
    try { html = dibujar(C, p); } catch (e) { html = ''; ok(`${n}: cada etiqueta apunta a su campo`, false, `no se pudo dibujar: ${(e as Error).message.slice(0, 80)}`); continue; }
    htmls[n] = html;
    const e = etiquetas(html);
    ok(`${n}: cada etiqueta apunta a su campo`, e.total > 0 && e.sueltas === 0 && e.huerfanas.length === 0,
      `${e.total} etiquetas, ${e.sueltas} sueltas, huerfanas: ${e.huerfanas.join(',')}`);
  }
  const cerrar = (html: string) => [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?lucide-x(?:(?!<\/button>)[\s\S])*?<\/button>/g)].map((m) => m[0]);
  let mv = '';
  try {
    mv = MV ? dibujar(MV, { h: { showViewModal: true, selectedSession: { registerName: 'Caja 1', createdAt: '2026-09-20T14:00:00Z', closedAt: null,
      initialBalance: '0', expectedBalance: '0', actualBalance: '0', difference: '0', status: 'closed', userId: 'u' }, setShowViewModal: () => {} } }) : '';
  } catch { mv = ''; }
  const botones = [...cerrar(htmls['apertura y nueva terminal'] ?? ''), ...cerrar(htmls['movimiento'] ?? ''), ...cerrar(mv)];
  ok('los tres botones de cerrar (una X) dicen que cierran',
    //  Lote 279: las tres ventanas son la comun, y su X dice "Cerrar" (sin mas: el titulo de la
    //  ventana, enlazado con `aria-labelledby`, dice de que ventana es).
    botones.length === 3 && botones.every((b) => /aria-label="Cerrar[^"]*"/.test(b)), `${botones.length} botones`);
  const arq = htmls['arqueo'] ?? '';
  const { DENOMINATIONS } = await import('../src/app/dashboard/cash/caja');
  const cantidades = [...arq.matchAll(/aria-label="Cantidad de ([^"]+)"/g)].map((m) => m[1]);
  ok('cada cantidad del arqueo dice de que denominacion es',
    cantidades.length === DENOMINATIONS.length && DENOMINATIONS.every((d, i) => cantidades[i] === d.label), `${cantidades.length} de ${DENOMINATIONS.length}`);

  console.log('\n4) Lo demas que marcaba React Doctor\n');
  const todo = pantalla.map((f) => sinComentarios(leer(f))).join('\n');
  const pag = sinComentarios(leer(`${DIR}/page.tsx`));
  ok('`m` dentro de `LazyMotion`: ningun `motion.` en la pantalla, y la pagina pone el `LazyMotion`',
    /<LazyMotion features=\{domAnimation\}>/.test(pag) && !/\bmotion\./.test(todo) && /\bm\.div\b/.test(todo));
  const arqCod = sinComentarios(leer(`${DIR}/components/VistaArqueo.tsx`));
  ok('la hora del arqueo se toma una vez, no en cada render',
    /const \[ahora\] = useState\(\(\) => new Date\(\)\);/.test(arqCod) && /formatDateTimeDisplay\(ahora\)/.test(arqCod) && !/\{[^{}]*new Date\(\)[^{}]*\}/.test(arqCod.replace(/useState\(\(\) => new Date\(\)\)/, '')));
  const hh = hooks[1];
  const exp = (() => { const i = hh.indexOf('const handleExportHistory = '); return i < 0 ? '' : hh.slice(i, hh.indexOf('\n  };', i)); })();
  ok('el CSV exportado suelta su memoria DESPUES de descargarse',
    /link\.click\(\);[\s\S]*URL\.revokeObjectURL\(url\);/.test(exp));
  const cajaTs = sinComentarios(leer(`${DIR}/caja.ts`));
  ok('el formateador de moneda se crea una vez, fuera de `fmt`',
    /^const MONEDA = new Intl\.NumberFormat\(/m.test(cajaTs) && /export const fmt = [^;]*MONEDA\.format\(/.test(cajaTs));
  ok('las pestañas, fuera del render', /^const TABS: /m.test(pag) && !/const tabs\b/.test(pag) && /\{TABS\.map\(/.test(pag));
  ok('el historico, filtrado y pintado en una pasada',
    /h\.history\.flatMap\(\(s\) => \{/.test(sinComentarios(leer(`${DIR}/components/VistaHistorico.tsx`))));

  console.log('\n5) Lo que no cambia\n');
  const { fmt } = await import('../src/app/dashboard/cash/caja');
  const viejo = (v: number | string) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(typeof v === 'string' ? parseFloat(v) : v);
  invariante('la moneda se escribe igual que antes', ['328719.58', 0, '0.1', -50, '1234567.891'].every((v) => fmt(v) === viejo(v)));
  if (VH) {
    const fila = (id: string, status: string, createdAt: string) => ({ id, status, createdAt, initialBalance: '0', expectedBalance: '0',
      actualBalance: '0', difference: '0', approvedAt: null, closedAt: null, userId: 'u', registerName: `Caja ${id}` });
    const base = { aprobando: null, errorCarga: null, aprobarDiferencia: () => {}, handleExportHistory: () => {}, loadHistory: () => {},
      setHistDateFrom: () => {}, setHistStatus: () => {}, setSelectedSession: () => {}, setShowViewModal: () => {},
      history: [fila('A', 'closed', '2026-09-01T14:00:00Z'), fila('B', 'open', '2026-09-20T14:00:00Z'), fila('C', 'closed', '2026-09-25T14:00:00Z')] };
    const cuales = (extra: object) => [...dibujar(VH, { h: { ...base, histStatus: '', histDateFrom: '', ...extra } }).matchAll(/Caja ([ABC])\b/g)]
      .map((m) => m[1]).filter((x, i, a) => a.indexOf(x) === i).join('');
    invariante('el filtro del historico deja pasar las mismas filas (estado y fecha)',
      cuales({}) === 'ABC' && cuales({ histStatus: 'closed' }) === 'AC' && cuales({ histDateFrom: '2026-09-10' }) === 'BC'
      && cuales({ histStatus: 'closed', histDateFrom: '2026-09-10' }) === 'C');
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
