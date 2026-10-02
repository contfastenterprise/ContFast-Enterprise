/**
 * Lote 245 -- filtros en la lista de conduces: por estado y por rango de fecha.
 * Pedido del dueño (2026-10-02): "pon filtros en la pagina
 * dashboard/delivery-notes por estado y rango de fecha".
 *
 * La lista solo sabia paginar. Ahora la ruta lee `estado`, `desde` y `hasta`, y
 * la pantalla lleva una barra con el estado y el rango de fecha de ENTREGA (la
 * que ensena la tabla; una columna `date`, que se compara como dia).
 *
 * Aqui se EJECUTAN las reglas (`filtrosDeConduces.ts`, las mismas para la
 * pantalla y para la ruta) y se DIBUJA la barra. Que la base filtre de verdad
 * -- y que el total sea el de lo filtrado -- lo ejecuta
 * `verificar_filtros_de_conduces_db.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const PAGINA = 'src/app/dashboard/delivery-notes/page.tsx';
const RUTA = 'src/app/api/v1/delivery-notes/route.ts';
const REPO = 'src/repositories/deliveryRepository.ts';
type Fn = (p: unknown) => unknown;

async function main() {
  //  Vale en los dos estados: la lista paginada de conduces.
  if (!/DeliveryRepository\.list\(/.test(leer(RUTA)) || !/per_page: String\(itemsPerPage\)/.test(leer(PAGINA))) throw new Error('Precondicion: la lista de conduces ya no pagina como se esperaba');

  console.log('\n1) Las reglas de los filtros, ejecutadas\n');
  type M = typeof import('../src/services/inventario/filtrosDeConduces');
  let R: M | null = null;
  try { R = await import('../src/services/inventario/filtrosDeConduces'); } catch { R = null; }
  const E1 = ['sin filtros, o con ellos vacios, no se filtra nada', 'estado y rango validos se leen tal cual', 'un estado que no existe se RECHAZA (no se ignora)',
    'una fecha que no existe se rechaza: el 31 de febrero, un texto cualquiera', 'un rango al reves se rechaza; el mismo dia en los dos extremos vale',
    'la pantalla solo manda lo que esta puesto', 'los estados son los tres del conduce, con el nombre que ensena la tabla'];
  if (!R) falta(E1, 'no existe services/inventario/filtrosDeConduces.ts');
  else {
    const r = R;
    const lee = (o: Record<string, string>) => r.leerFiltrosDeConduces(new URLSearchParams(o));
    const vacio = lee({});
    const blancos = lee({ estado: ' ', desde: '', hasta: '' });
    ok(E1[0], vacio.bien && JSON.stringify(vacio.filtros) === '{}' && blancos.bien && JSON.stringify(blancos.filtros) === '{}');
    const todo = lee({ estado: 'approved', desde: '2026-09-01', hasta: '2026-09-30' });
    ok(E1[1], todo.bien && JSON.stringify(todo.filtros) === JSON.stringify({ estado: 'approved', desde: '2026-09-01', hasta: '2026-09-30' })
      && (() => { const s = lee({ desde: '2026-09-01' }); return s.bien && JSON.stringify(s.filtros) === '{"desde":"2026-09-01"}'; })());
    const malo = lee({ estado: 'despachado' });
    ok(E1[2], !malo.bien && /estado/.test(malo.mensaje) && !lee({ estado: 'APPROVED' }).bien, malo.bien ? 'lo dejo pasar' : malo.mensaje);
    ok(E1[3], !lee({ desde: '2026-02-31' }).bien && !lee({ hasta: 'ayer' }).bien && !lee({ desde: '01/09/2026' }).bien && lee({ desde: '2028-02-29' }).bien);
    const reves = lee({ desde: '2026-09-30', hasta: '2026-09-01' });
    ok(E1[4], !reves.bien && /posterior/.test(reves.mensaje) && lee({ desde: '2026-09-15', hasta: '2026-09-15' }).bien);
    ok(E1[5], JSON.stringify(r.parametrosDeFiltros(r.SIN_FILTROS)) === '{}' && JSON.stringify(r.parametrosDeFiltros({ estado: 'draft', desde: '', hasta: '2026-09-30' })) === '{"estado":"draft","hasta":"2026-09-30"}'
      && !r.hayFiltros(r.SIN_FILTROS) && r.hayFiltros({ estado: '', desde: '2026-09-01', hasta: '' }));
    ok(E1[6], r.ESTADOS_DE_CONDUCE.map((e) => `${e.valor}:${e.nombre}`).join('|') === 'draft:Borrador|approved:Despachado|voided:Anulado');
  }

  console.log('\n2) La barra de filtros, dibujada\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let Barra: Fn | null = null;
  try { Barra = ((await import('../src/app/dashboard/delivery-notes/components/FiltrosDeConduces')) as unknown as Record<string, Fn>).FiltrosDeConduces ?? null; } catch { Barra = null; }
  const E2 = ['el desplegable de estado: "Todos" y los tres estados, con su etiqueta', 'lo elegido se ve: el estado marcado y el rango en dd/MM/aaaa',
    '"Quitar filtros" solo sale cuando hay alguno puesto'];
  if (!Barra) falta(E2, 'no existe FiltrosDeConduces');
  else {
    const nada = () => {};
    const pinta = (f: object) => renderToStaticMarkup(React.createElement(Barra as never, { filtros: { estado: '', desde: '', hasta: '', ...f }, alCambiar: nada, alLimpiar: nada }));
    const sin = pinta({});
    const opciones = [...sin.matchAll(/<option value="([^"]*)"[^>]*>([^<]+)<\/option>/g)].map((m) => `${m[1]}:${m[2]}`);
    ok(E2[0], opciones.join('|') === ':Todos|draft:Borrador|approved:Despachado|voided:Anulado' && /<label for="filtro-estado-conduce"/.test(sin) && /<select id="filtro-estado-conduce"/.test(sin), opciones.join('|'));
    const con = pinta({ estado: 'approved', desde: '2026-09-01', hasta: '2026-09-30' });
    ok(E2[1], /<option value="approved" selected="">Despachado<\/option>/.test(con) && /01\/09\/2026 – 30\/09\/2026/.test(con) && /Seleccionar rango de fecha/.test(sin));
    ok(E2[2], !/Quitar filtros/.test(sin) && /<button type="button"[^>]*>.*Quitar filtros<\/button>/.test(con) && /Quitar filtros/.test(pinta({ desde: '2026-09-01', hasta: '2026-09-01' })));
  }

  console.log('\n3) De la pantalla a la base\n');
  const pagina = sinComentarios(leer(PAGINA));
  ok('la pantalla manda los filtros con la pagina, y vuelve a pedir la lista cuando cambian',
    /per_page: String\(itemsPerPage\),\s*\.\.\.parametrosDeFiltros\(filtros\),/.test(pagina) && /\}, \[page, filtros\]\);/.test(pagina)
    && /<FiltrosDeConduces filtros=\{filtros\} alCambiar=\{cambiarFiltros\} alLimpiar=\{limpiarFiltros\} \/>/.test(pagina));
  ok('  cambiar o quitar un filtro vuelve a la pagina 1',
    /const cambiarFiltros = \([^)]*\) => \{ setFiltros\([\s\S]{0,60}\); setPage\(1\); \};/.test(pagina) && /const limpiarFiltros = \(\) => \{ setFiltros\(SIN_FILTROS\); setPage\(1\); \};/.test(pagina));
  ok('  y una lista vacia por los filtros no dice que "no hay conduces registrados"', /hayFiltros\(filtros\) \? 'Ningún conduce cumple esos filtros\.' : 'No se encontraron conduces registrados\.'/.test(pagina));
  const ruta = sinComentarios(leer(RUTA));
  ok('la ruta lee los filtros y RECHAZA con 400 lo que no entiende, antes de consultar',
    /const leidos = leerFiltrosDeConduces\(searchParams\);\s*if \(!leidos\.bien\) \{[\s\S]{0,260}status: 400[\s\S]{0,80}\}\s*const list = await DeliveryRepository\.list\(auth\.companyId, auth\.modo, page, perPage, leidos\.filtros\);/.test(ruta));
  const repo = sinComentarios(leer(REPO));
  const lista = (() => { const i = repo.indexOf('static async list('); return i < 0 ? '' : repo.slice(i, repo.indexOf('static async approve(', i)); })();
  ok('el listado filtra por estado y por fecha de ENTREGA, con los extremos dentro',
    /filtros\.estado \? eq\(deliveryNotes\.status, filtros\.estado\) : undefined/.test(lista) && /filtros\.desde \? gte\(deliveryNotes\.deliveryDate, filtros\.desde\) : undefined/.test(lista)
    && /filtros\.hasta \? lte\(deliveryNotes\.deliveryDate, filtros\.hasta\) : undefined/.test(lista));
  ok('  con UNA condicion para el total y para la pagina (o el total contaria lo que no se ensena)',
    (lista.match(/\.where\(donde\)/g) ?? []).length === 2 && (lista.match(/\.where\(/g) ?? []).length === 2);

  console.log('\n4) Lo que no cambia\n');
  //  Cierto antes y despues: como `ok()` regalaria un OK en la contraprueba.
  invariante('el listado sigue acotado por empresa y modo, sin los borrados, del mas nuevo al mas viejo',
    /eq\(deliveryNotes\.companyId, companyId\)/.test(lista) && /eq\(deliveryNotes\.modo, modo\)/.test(lista) && /isNull\(deliveryNotes\.deletedAt\)/.test(lista) && /orderBy\(desc\(deliveryNotes\.createdAt\)\)/.test(lista));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
