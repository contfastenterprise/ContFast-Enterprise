/**
 * Lote 226 -- la pagina de conduces, partida en componentes SIN cambiar lo que
 * hace. Pedido del dueño.
 *
 * `delivery-notes/page.tsx` tenia 844 lineas (React Doctor: complejidad alta).
 * Queda la lista en la pagina y salen `AplicarPorCodigo`, `TablaDeConduces`,
 * `FormularioDeConduce`, `BuscadorDeFacturas` y `useFormularioConduce`.
 *
 * LO QUE ESTE BANCO DEMUESTRA, y es lo unico que importa en un refactor: que no
 * cambio nada que se vea. Se extraen de la pagina de ANTES (commit a7b763c, el
 * main del que sale el lote) y de los ficheros de AHORA todas las clases, los
 * textos visibles, los `placeholder`, los `title`, los avisos (`toast`) y las
 * direcciones de la API, y tienen que coincidir UNO POR UNO, con las mismas
 * repeticiones. Es cierto antes y despues por construccion, asi que va como
 * INVARIANTE (codigo 3), no como `ok()`: lo que da FALLA en la contraprueba es
 * que la pagina este partida.
 *
 * Y una trampa que el refactor podia esconder: lo escrito en el alta (chofer,
 * placa, fecha) SOBREVIVIA a cancelar. Con el estado dentro del formulario se
 * perderia al desmontarlo. Se vigila.
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

const DIR = 'src/app/dashboard/delivery-notes';
const PAGINA = `${DIR}/page.tsx`;
const NUEVOS = [
  `${DIR}/components/AplicarPorCodigo.tsx`,
  `${DIR}/components/TablaDeConduces.tsx`,
  `${DIR}/components/FormularioDeConduce.tsx`,
  `${DIR}/components/BuscadorDeFacturas.tsx`,
  `${DIR}/hooks/useFormularioConduce.ts`,
];
const ANTES = 'a7b763c';

/** Todo lo que se VE o se PIDE, como multiconjunto ordenado. */
function huella(src: string): string[] {
  const s = sinComentarios(src);
  const out: string[] = [];
  const tomar = (re: RegExp, pref: string) => { for (const m of s.matchAll(re)) out.push(`${pref}:${(m[1] ?? m[2] ?? '').trim()}`); };
  tomar(/className="([^"]*)"/g, 'clase');
  tomar(/className=\{clsx\(\s*"([^"]*)"/g, 'clase');
  tomar(/placeholder="([^"]*)"/g, 'placeholder');
  tomar(/title="([^"]*)"/g, 'title');
  tomar(/toast\.(?:success|error|warning|info|loading)\(\s*(?:'([^']*)'|`([^`]*)`)/g, 'aviso');
  tomar(/fetch\(\s*[`']([^`']*)[`']/g, 'api');
  //  Texto de JSX: lo que va entre `>` y `<` sin llaves.
  for (const m of s.matchAll(/>([^<>{}]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    //  Fuera lo que es codigo y no texto (`useState<any[]>(...)`, `) : x ? (`):
    //  un texto que se ve no lleva `;`, `=`, `&&`, `||` ni un `?` de ternario.
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

async function main() {
  let antes = '';
  try { antes = execSync(`git show ${ANTES}:${PAGINA}`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { antes = ''; }
  if (!antes.includes('export default function DeliveryNotesPage')) throw new Error(`Precondicion: no se pudo leer la pagina de ${ANTES}`);

  console.log('\n1) Nada visible cambio\n');
  //  LOTE 227: se comparan los DOS COMMITS, no la carpeta. El 227 cambia marcado
  //  a proposito (etiquetas, un <button> en el buscador), asi que "igual que
  //  antes del 226" ya no es cierto del arbol de hoy -- pero la prueba del 226
  //  sigue siendo la misma: entre a7b763c y la fusion del 226 (21e3dab) no
  //  cambio nada visible. Atada a esos dos commits, vale para siempre.
  const DESPUES = '21e3dab';
  const mostrar = (ref: string, f: string) => {
    try { return execSync(`git show ${ref}:${f}`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { return ''; }
  };
  const ahora = [PAGINA, ...NUEVOS].map((f) => mostrar(DESPUES, f)).join('\n');
  if (!ahora.includes('export function TablaDeConduces')) throw new Error(`Precondicion: no se pudo leer ${DESPUES}`);
  const dif = diferencia(huella(antes), huella(ahora));
  invariante(`clases, textos, placeholders, titulos, avisos y API: los mismos, uno por uno (${huella(antes).length})`,
    dif.length === 0, dif.slice(0, 6).join(' | '));

  console.log('\n2) La pagina esta partida\n');
  const pagina = leer(PAGINA);
  const lineas = pagina.split('\n').length;
  ok('la pagina baja de 300 lineas', lineas < 300, `${lineas} lineas`);
  const tamanos = NUEVOS.map((f) => [f, leer(f).split('\n').length] as const);
  ok('cada pieza existe y tampoco pasa de 300', tamanos.every(([f, n]) => leer(f) !== '' && n < 300),
    tamanos.map(([f, n]) => `${f.split('/').pop()}=${leer(f) ? n : 'NO'}`).join(', '));
  const cod = sinComentarios(pagina);
  ok('la pagina usa cada pieza',
    /<AplicarPorCodigo onAplicado=\{loadDeliveryNotes\} \/>/.test(cod)
    && /<TablaDeConduces[\s\S]{0,200}onVer=\{visor\.abrir\}/.test(cod)
    && /<FormularioDeConduce formulario=\{formulario\} onSalir=\{salirDelFormulario\} \/>/.test(cod)
    && /<BuscadorDeFacturas formulario=\{formulario\} \/>/.test(cod));
  ok('  y ya no lleva su marcado: ni la tabla ni el formulario ni la ventana de busqueda',
    !/<table/.test(cod) && !/<form/.test(cod) && !/Buscar Facturas Pendientes/.test(cod));

  console.log('\n3) Lo escrito en el alta sobrevive a cancelar, como antes\n');
  ok('el estado del alta se crea en la PAGINA, no en el formulario',
    /const formulario = useFormularioConduce\(\{/.test(cod)
    && !/useState/.test(leer(`${DIR}/components/FormularioDeConduce.tsx`))
    && !/useState/.test(leer(`${DIR}/components/BuscadorDeFacturas.tsx`)));
  const hook = sinComentarios(leer(`${DIR}/hooks/useFormularioConduce.ts`));
  const descartar = (() => { const i = hook.indexOf('const descartarFactura = () => {'); return i < 0 ? '' : hook.slice(i, hook.indexOf('};', i)); })();
  ok('  y cancelar solo suelta la factura y sus lineas (el chofer, la placa y la fecha se quedan)',
    descartar.includes('setTargetInvoice(null);') && descartar.includes('setDispatchLines([]);')
    && !/setDriverName|setVehiclePlate|setDeliveryDate|setDriverLicense|setDispatcherName|setNotesText/.test(descartar)
    && /const salirDelFormulario = \(\) => \{\s*setShowForm\(false\);\s*formulario\.descartarFactura\(\);\s*\};/.test(cod));

  console.log('\n4) Las piezas, ejecutadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let T: ((p: unknown) => unknown) | null = null;
  try { T = ((await import('../src/app/dashboard/delivery-notes/components/TablaDeConduces')) as unknown as { TablaDeConduces: typeof T }).TablaDeConduces; } catch { T = null; }
  if (!T) ok('la tabla pinta las acciones de cada estado', false, 'no existe TablaDeConduces');
  else {
    const nada = () => {};
    const fila = (id: string, status: string) => ({ id, deliveryNumber: `CON-${id}`, deliveryDate: '2026-09-25', driverName: 'Chofer', vehiclePlate: 'L1', status });
    const html = renderToStaticMarkup(React.createElement(T as never, {
      notes: [fila('1', 'draft'), fila('2', 'approved'), fila('3', 'voided')], onVer: nada, onImprimir: nada, onAprobar: nada, onAnular: nada,
    }));
    const filas = html.split('<tr').slice(2);
    const titulos = (f: string) => [...f.matchAll(/title="([^"]*)"/g)].map((m) => m[1]).join('|');
    ok('la tabla pinta las acciones de cada estado',
      titulos(filas[0]) === 'Ver Conduce|Imprimir Conduce|Aprobar y Despachar Inventario|Eliminar Borrador'
      && titulos(filas[1]) === 'Ver Conduce|Imprimir Conduce|Anular y Revertir Inventario'
      && titulos(filas[2]) === 'Ver Conduce|Imprimir Conduce'
      && html.includes('25-09-2026'), filas.map(titulos).join(' / '));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
