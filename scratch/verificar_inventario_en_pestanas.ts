/**
 * Lote 241 -- las pantallas de Inventario con alta de registro llevan PESTANAS,
 * como Compras. Pedido del dueño (2026-10-02): "todas las paginas de la seccion
 * de inventario que lleven nuevo registro, que sean con tab, al igual que
 * compras". Productos se hizo en el lote 240.
 *
 * Medido antes (solo lectura): el grupo Inventario del menu tiene nueve
 * pantallas, y las que tienen un alta son tres mas productos:
 *
 *  · ALMACENES y CATEGORIAS abrian un modal: ahora el formulario es la segunda
 *    pestana y ocupa la pagina;
 *  · CONDUCES ya ensenaba su formulario en la pagina; le faltaban las pestanas
 *    (tenia un boton "Nuevo Conduce" y, para volver, solo "Cancelar").
 *
 * Las otras cinco (transferencias, movimientos, ajustes, reorden, codigos de
 * barra) no abren un formulario de alta aparte.
 *
 * Las dos pestanas son UN componente (`pestanas-de-registro.tsx`): el banco lo
 * DIBUJA, y mira en cada pantalla que la lista y el formulario no se pinten a
 * la vez y que el formulario ya no sea un modal.
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

const D = 'src/app/dashboard';
const ALMACENES = `${D}/warehouses/page.tsx`;
const CATEGORIAS = `${D}/inventory/categories/page.tsx`;
const CONDUCES = `${D}/delivery-notes/page.tsx`;
type Fn = (p: unknown) => unknown;

/** La etiqueta `<PestanasDeRegistro ... />` de una pagina (la primera), en una linea. */
const pestanasDe = (src: string) => (/<PestanasDeRegistro\b[\s\S]*?\/>/.exec(src)?.[0] ?? '').replace(/\s+/g, ' ');

async function main() {
  const alm = sinComentarios(leer(ALMACENES));
  const cat = sinComentarios(leer(CATEGORIAS));
  const con = sinComentarios(leer(CONDUCES));
  //  Vale en los dos estados: las tres pantallas con su alta.
  if (!/id="warehouse-form"/.test(alm) || !/<form onSubmit=\{handleSubmit\}/.test(cat) || !/<FormularioDeConduce /.test(con)) throw new Error('Precondicion: alguna de las tres pantallas ya no tiene su formulario de alta');

  console.log('\n1) Las pestanas, dibujadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let M: Record<string, Fn> | null = null;
  try { M = (await import('../src/components/ui/pestanas-de-registro')) as unknown as Record<string, Fn>; } catch { M = null; }
  const E1 = ['dos pestanas: la lista y "Registrar"; la activa lo dice y ninguna envia un formulario', 'al editar, la segunda dice "Editando"; en la lista vuelve a decir "Registrar"',
    'el panel del formulario: titulo, descripcion si la hay, y sin barra de desplazamiento ni capa sobre la pagina'];
  if (!M?.PestanasDeRegistro || !M?.PanelDeRegistro) falta(E1, 'no existe components/ui/pestanas-de-registro.tsx');
  else {
    const P = M.PestanasDeRegistro; const nada = () => {};
    const pinta = (props: object) => renderToStaticMarkup(React.createElement(P as never, { lista: 'Almacenes', alVerLista: nada, alRegistrar: nada, enFormulario: false, ...props }));
    const botones = (h: string) => [...h.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => `${m[1]}:${m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').trim()}`);
    const enLista = botones(pinta({}));
    const enForm = botones(pinta({ enFormulario: true }));
    ok(E1[0], enLista.join('|') === 'true:Almacenes|false:Registrar' && enForm.join('|') === 'false:Almacenes|true:Registrar' && (pinta({}).match(/<button\b/g) ?? []).length === 2,
      `${enLista.join('|')} ; ${enForm.join('|')}`);
    ok(E1[1], botones(pinta({ enFormulario: true, editando: true }))[1] === 'true:Editando' && botones(pinta({ enFormulario: false, editando: true }))[1] === 'false:Registrar');
    const panel = renderToStaticMarkup(React.createElement(M.PanelDeRegistro as never, { titulo: 'Nuevo Almacén', descripcion: 'Detalles.' }, 'CUERPO'));
    const sinDesc = renderToStaticMarkup(React.createElement(M.PanelDeRegistro as never, { titulo: 'Nueva Categoría' }, 'CUERPO'));
    ok(E1[2], /<h2[^>]*>Nuevo Almacén<\/h2><p[^>]*>Detalles\.<\/p>/.test(panel) && /CUERPO/.test(panel) && !/<p\b/.test(sinDesc)
      && !/fixed|inset-0|overflow-y-auto|max-h-|bg-black/.test(panel));
  }

  console.log('\n2) Almacenes\n');
  const pa = pestanasDe(alm);
  ok('las pestanas sustituyen al boton "Nuevo Almacén": "Registrar" empieza uno nuevo, no reabre el que se editaba',
    /enFormulario=\{isModalOpen\}/.test(pa) && /lista="Almacenes"/.test(pa) && /editando=\{!!currentWarehouse\}/.test(pa) && /alVerLista=\{\(\) => setIsModalOpen\(false\)\}/.test(pa)
    && /alRegistrar=\{\(\) => \{ setCurrentWarehouse\(null\); setIsModalOpen\(true\); \}\}/.test(pa) && !/\n\s*Nuevo Almacén\s*<\/button>/.test(alm), pa.slice(0, 120));
  const listaAlm = (() => { const i = alm.indexOf('{!isModalOpen && (<>'); return i < 0 ? '' : alm.slice(i, alm.indexOf('</>)}', i)); })();
  const formAlm = (() => { const i = alm.indexOf('{isModalOpen && ('); return i < 0 ? '' : alm.slice(i); })();
  ok('  la lista y el formulario no se pintan a la vez, y el formulario ya no es un modal',
    /<SearchBar/.test(listaAlm) && /filteredWarehouses\.map/.test(listaAlm) && !/warehouse-form/.test(listaAlm)
    && /<PanelDeRegistro/.test(formAlm) && /id="warehouse-form"/.test(formAlm) && !/<Modal\b/.test(alm) && !/components\/ui\/dialog/.test(alm));
  ok('  el formulario se monta de nuevo al cambiar de almacen (sus campos llevan `defaultValue`: sin eso, editar uno y luego otro dejaria los datos del primero)',
    /<form id="warehouse-form" key=\{currentWarehouse\?\.id \?\? 'nuevo'\}/.test(alm));
  ok('  y conserva guardar y cancelar', /form="warehouse-form"/.test(formAlm) && /onClick=\{\(\) => setIsModalOpen\(false\)\}[\s\S]{0,400}Cancelar/.test(formAlm) && /Guardar Cambios/.test(formAlm));

  console.log('\n3) Categorias\n');
  const pc = pestanasDe(cat);
  ok('las pestanas sustituyen al boton "Nueva Categoría"',
    /enFormulario=\{showModal\}/.test(pc) && /lista="Categorías"/.test(pc) && /editando=\{!!editId\}/.test(pc) && /alVerLista=\{\(\) => setShowModal\(false\)\}/.test(pc)
    && /alRegistrar=\{openNewModal\}/.test(pc) && !/<span className="font-bold">Nueva Categoría<\/span>/.test(cat), pc.slice(0, 120));
  const listaCat = (() => { const i = cat.indexOf('{!showModal && (<>'); return i < 0 ? '' : cat.slice(i, cat.indexOf('</>)}', i)); })();
  const formCat = (() => { const i = cat.indexOf('{showModal && ('); return i < 0 ? '' : cat.slice(i); })();
  ok('  la lista y el formulario no se pintan a la vez, y el formulario ya no es un modal',
    /<SearchBar/.test(listaCat) && /<Pagination/.test(listaCat) && !/<form onSubmit=\{handleSubmit\}/.test(listaCat)
    && /<PanelDeRegistro/.test(formCat) && /<form onSubmit=\{handleSubmit\}/.test(formCat) && !/fixed inset-0|bg-black\/|backdrop-blur/.test(cat));

  console.log('\n4) Conduces\n');
  const todas = [...con.matchAll(/<PestanasDeRegistro\b[\s\S]*?\/>/g)].map((m) => m[0].replace(/\s+/g, ' '));
  ok('las pestanas salen en la lista Y en el formulario: desde el alta se vuelve con "Conduces"',
    todas.length === 2 && todas.every((t) => /enFormulario=\{showForm\}/.test(t) && /lista="Conduces"/.test(t) && /alVerLista=\{salirDelFormulario\}/.test(t) && /alRegistrar=\{\(\) => setShowForm\(true\)\}/.test(t))
    && !/\n\s*<Plus[^>]*\/> Nuevo Conduce\s*<\/button>/.test(con), `${todas.length} juegos de pestanas`);

  console.log('\n5) Lo que no cambia\n');
  //  Cierto antes y despues: como `ok()` regalaria un OK en la contraprueba.
  invariante('guardar un almacen o una categoria sigue cerrando el formulario', /setIsModalOpen\(false\);/.test(alm) && /setShowModal\(false\);/.test(cat));
  invariante('editar sigue abriendo el formulario con el registro', /setCurrentWarehouse\(warehouse\);\s*setIsModalOpen\(true\);/.test(alm) && /const openEditModal = \(cat: Category\) => \{[\s\S]*?setShowModal\(true\);/.test(cat));
  invariante('en conduces, salir del alta sigue soltando la factura elegida', /const salirDelFormulario = \(\) => \{\s*setShowForm\(false\);\s*formulario\.descartarFactura\(\);/.test(con));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
