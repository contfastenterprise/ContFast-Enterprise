/**
 * Lote 229 -- la pagina de caja, partida en componentes SIN cambiar lo que
 * hace. Pedido del dueño tras el lote 228.
 *
 * `cash/page.tsx` tenia 1.629 lineas. Quedan en la pagina las pestanas y los
 * envoltorios animados de cada vista; salen `caja.ts` (tipos y ayudantes), los
 * hooks `useCaja` (la caja abierta) y `useHistorialCaja` (el historico), y siete
 * componentes: tres vistas de la caja, el historico y tres ventanas.
 *
 * LO QUE ESTE BANCO DEMUESTRA, y es lo unico que importa en un refactor: que no
 * cambio nada que se vea. Se extraen de la pagina de ANTES (0078ab2, el main
 * del que sale el lote) y de los ficheros de AHORA las clases, los textos
 * visibles, los `placeholder`, los `title`, los avisos y las direcciones de la
 * API, y tienen que coincidir UNO POR UNO. Es cierto antes y despues, asi que
 * va como INVARIANTE (codigo 3), no como `ok()`.
 *
 * Y lo que un corte en dos hooks podia romper sin que se viera: cada hook
 * necesita una accion del otro. Abrir la pestaña del historico lo CARGA, y dar
 * por revisada una diferencia RECARGA la caja. Antes era una llamada dentro de
 * la misma funcion; ahora cruza de un hook a otro, y si se pierde la pantalla
 * compila igual y enseña un historico vacio.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';


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
const PAGINA = `${DIR}/page.tsx`;
const COMPONENTES = ['VistaApertura', 'VistaGestion', 'VistaArqueo', 'VistaHistorico', 'ModalMovimiento', 'ModalCierre', 'ModalVerSesion'];
const NUEVOS = [
  `${DIR}/caja.ts`, `${DIR}/hooks/useCaja.ts`, `${DIR}/hooks/useHistorialCaja.ts`,
  ...COMPONENTES.map((n) => `${DIR}/components/${n}.tsx`),
];
const ANTES = '0078ab2';

/** Todo lo que se VE o se PIDE, como multiconjunto ordenado. */
function huella(src: string): string[] {
  //  Lo que era `session` ahora es `c.session`, y lo del historico `h.`: dentro
  //  de una plantilla (`${c.session.id}`) eso no es algo que se vea.
  const s = sinComentarios(src).replace(/\$\{[ch]\./g, '${');
  const out: string[] = [];
  const tomar = (re: RegExp, pref: string) => { for (const m of s.matchAll(re)) out.push(`${pref}:${(m[1] ?? m[2] ?? '').trim()}`); };
  tomar(/className="([^"]*)"/g, 'clase');
  tomar(/className=\{clsx\(\s*['"]([^'"]*)['"]/g, 'clase');
  tomar(/placeholder="([^"]*)"/g, 'placeholder');
  tomar(/title="([^"]*)"/g, 'title');
  tomar(/aria-label="([^"]*)"/g, 'aria');
  tomar(/toast\.(?:success|error|warning|info|loading)\(\s*(?:'([^']*)'|`([^`]*)`)/g, 'aviso');
  tomar(/fetch\(\s*[`']([^`']*)[`']/g, 'api');
  //  `(?<!=)`: el `>` de una flecha (`() => Promise<void>`) no abre texto.
  for (const m of s.matchAll(/(?<!=)>([^<>{}]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && !/[;=]|&&|\|\||\?\s|\s\?|^\)|\($/.test(t)) out.push(`texto:${t}`);
  }
  return out.filter((x) => !x.endsWith(':')).sort();
}

function diferencia(a: string[], b: string[]) {
  const cuenta = new Map<string, number>();
  for (const x of a) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
  for (const x of b) cuenta.set(x, (cuenta.get(x) ?? 0) - 1);
  return [...cuenta].filter(([, n]) => n !== 0).map(([x, n]) => `${n > 0 ? 'solo antes' : 'solo ahora'} x${Math.abs(n)}: ${x}`);
}

type Fn = (p: unknown) => unknown;

async function main() {
  let antes = '';
  try { antes = execSync(`git show ${ANTES}:${PAGINA}`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { antes = ''; }
  if (!antes.includes('export default function CashPage')) throw new Error(`Precondicion: no se pudo leer la pagina de ${ANTES}`);
  //  Vale en los dos estados, por eso es precondicion y no `ok()`: las vistas se
  //  animan con su `key` dentro de AnimatePresence, y eso se queda en la pagina.
  const pag0 = sinComentarios(leer(PAGINA));
  if (!['apertura', 'gestion', 'arqueo', 'historico'].every((k) => new RegExp(`key="${k}"`).test(pag0))
    || !/<AnimatePresence mode="wait">/.test(pag0)) throw new Error('Precondicion: las vistas ya no se animan con su key en la pagina');

  console.log('\n1) Nada visible cambio\n');
  //  LOTE 230: se comparan los DOS COMMITS, no la carpeta. El 230 cambia marcado
  //  a proposito (etiquetas con su campo, `aria-label` en los botones de cerrar,
  //  el lector de respuestas), asi que "igual que antes del 229" ya no es cierto
  //  del arbol de hoy -- pero la prueba del 229 sigue siendo la misma: entre
  //  0078ab2 y el commit del 229 (0724cb7) no cambio nada visible.
  const DESPUES = '0724cb7';
  const mostrar = (ref: string, f: string) => {
    try { return execSync(`git show ${ref}:${f}`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { return ''; }
  };
  const ahora = [PAGINA, ...NUEVOS].map((f) => mostrar(DESPUES, f)).join('\n');
  if (!ahora.includes('export function VistaHistorico')) throw new Error(`Precondicion: no se pudo leer ${DESPUES}`);
  const hA = huella(antes);
  const dif = diferencia(hA, huella(ahora));
  invariante(`clases, textos, placeholders, titulos, avisos y API: los mismos, uno por uno (${hA.length})`,
    dif.length === 0, dif.slice(0, 6).join(' | '));

  console.log('\n2) La pagina esta partida\n');
  const pagina = leer(PAGINA);
  const lineas = pagina.split('\n').length;
  ok('la pagina baja de 300 lineas', lineas < 300, `${lineas} lineas`);
  const tamanos = NUEVOS.map((f) => [f, leer(f).split('\n').length] as const);
  ok('cada pieza existe y tampoco pasa de 300', tamanos.every(([f, n]) => leer(f) !== '' && n < 300),
    tamanos.map(([f, n]) => `${f.split('/').pop()}=${leer(f) ? n : 'NO'}`).join(', '));
  const cod = sinComentarios(pagina);
  const usadas = COMPONENTES.filter((n) => new RegExp(`<${n} [ch]=\\{(?:caja|historial)\\} />`).test(cod)
    && new RegExp(`import \\{ ${n} \\} from './components/${n}';`).test(cod));
  ok('la pagina importa y usa cada pieza', usadas.length === COMPONENTES.length, `usadas: ${usadas.join(', ')}`);
  ok('  y ya no lleva su marcado: ni formularios, ni tablas, ni estado propio',
    !/<form|<table|useState|useEffect|fetch\(/.test(cod));

  console.log('\n3) Lo que cruza de un hook a otro\n');
  ok('la pagina ata los dos hooks',
    /useHistorialCaja\(\{ recargarCaja: \(\) => caja\.loadCashData\(\) \}\)/.test(cod)
    && /useCaja\(\{ alAbrirHistorico: \(\) => historial\.loadHistory\(\) \}\)/.test(cod));
  const hc = sinComentarios(leer(`${DIR}/hooks/useCaja.ts`));
  const tab = (() => { const i = hc.indexOf('const handleTabChange = '); return i < 0 ? '' : hc.slice(i, hc.indexOf('\n  };', i)); })();
  ok('abrir el historico lo CARGA', /if \(newView === 'historico'\) alAbrirHistorico\(\);/.test(tab));
  const hh = sinComentarios(leer(`${DIR}/hooks/useHistorialCaja.ts`));
  const apr = (() => { const i = hh.indexOf('const aprobarDiferencia = '); return i < 0 ? '' : hh.slice(i, hh.indexOf('\n  };', i)); })();
  ok('dar por revisada una diferencia RECARGA la caja, tras el exito',
    /toast\.success\('Diferencia dada por revisada'[\s\S]*?\}\);\s*await recargarCaja\(\);\s*\} catch/.test(apr));
  ok('la caja se carga UNA vez al entrar: el efecto vive en el hook y la pagina no lo repite',
    (hc.match(/useEffect\(\(\) => \{\s*loadCashData\(\);\s*\}, \[loadCashData\]\);/g) ?? []).length === 1);

  console.log('\n4) Las piezas, ejecutadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const cargar = async (n: string): Promise<Fn | null> => {
    try { return ((await import(`../src/app/dashboard/cash/components/${n}`)) as Record<string, Fn>)[n] ?? null; } catch { return null; }
  };
  const nada = () => {};
  const G = await cargar('VistaGestion');
  if (!G) ok('la gestion: el administrador ve el saldo, el cajero no', false, 'no existe VistaGestion');
  else {
    const sesion = { id: 's', initialBalance: '1000.00', createdAt: '2026-09-29T14:00:00Z', registerName: 'Caja 1' };
    const pintar = (extra: object) => renderToStaticMarkup(React.createElement(G as never, {
      c: { session: { ...sesion, ...extra }, movements: [], handleTabChange: nada, refreshMovements: nada, setMoveType: nada, setShowMoveModal: nada },
    }));
    const adm = pintar({ expectedBalance: '328719.58', saldoVisible: true });
    const caj = pintar({ saldoVisible: false });
    ok('la gestion: el administrador ve el saldo, el cajero no',
      adm.includes('328,719.58') && !adm.includes('Se ve al cerrar la caja')
      && !caj.includes('328,719.58') && caj.includes('Se ve al cerrar la caja'));
  }
  const H = await cargar('VistaHistorico');
  if (!H) {
    ok('el historico: el boton de revisar solo donde hay algo que revisar', false, 'no existe VistaHistorico');
    ok('  y un fallo al cargar se dice, no pasa por "no hay cierres"', false, 'no existe VistaHistorico');
  }
  else {
    const fila = (id: string, difference: string | null, approvedAt: string | null) => ({
      id, status: 'closed', initialBalance: '0', expectedBalance: '100', actualBalance: '100', difference, approvedAt,
      createdAt: '2026-09-20T14:00:00Z', closedAt: '2026-09-20T22:00:00Z', userId: 'u', registerName: 'Caja 1',
    });
    const base = { histStatus: '', histDateFrom: '', aprobando: null, errorCarga: null,
      aprobarDiferencia: nada, handleExportHistory: nada, loadHistory: nada, setHistDateFrom: nada, setHistStatus: nada,
      setSelectedSession: nada, setShowViewModal: nada };
    const html = renderToStaticMarkup(React.createElement(H as never, { h: { ...base,
      history: [fila('a', '-50.00', null), fila('b', '0.00', null), fila('c', '-50.00', '2026-09-21T10:00:00Z')] } }));
    const filas = html.split('<tr').filter((f) => f.includes('Caja 1'));
    const revisar = (f: string) => f.includes('aria-label="Dar por revisada la diferencia del arqueo"');
    const revisada = (f: string) => f.includes('title="Diferencia revisada"');
    ok('el historico: el boton de revisar solo donde hay algo que revisar',
      filas.length === 3 && revisar(filas[0]) && !revisar(filas[1]) && !revisar(filas[2]) && revisada(filas[2]) && !revisada(filas[0]),
      `${filas.length} filas`);
    const err = renderToStaticMarkup(React.createElement(H as never, { h: { ...base, history: [], errorCarga: 'Sin red' } }));
    ok('  y un fallo al cargar se dice, no pasa por "no hay cierres"',
      err.includes('data-error-carga') && err.includes('Sin red') && !err.includes('No hay registros de cierres de caja.'));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
