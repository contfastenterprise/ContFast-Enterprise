/**
 * Lote 244 -- Clientes y Suplidores, con pestanas como Compras. Pedido del dueño
 * (2026-10-02): "haz lo mismo con las demas secciones que tengan nuevo
 * registro" (lo mismo que Inventario, lotes 240-243).
 *
 * Las dos pantallas eran gemelas: cabecera con "Imprimir" y "Nuevo ...", y un
 * modal de 768 px con `max-h-[90vh]` y barra de desplazamiento propia. Ahora:
 *
 *  · en la cabecera, SOLO las pestanas ("Clientes" / "Registrar");
 *  · "Imprimir" baja a la barra de la lista, junto al buscador;
 *  · el formulario es la segunda pestana y ocupa la pagina.
 *
 * La conversion la hizo un guion (`scratch/_to_delete/patron_a.py`): el
 * formulario se movio tal cual, sin tocar un campo. Que las dos se ven bien se
 * miro en el navegador; aqui se vigila que ninguna vuelva a ser un modal.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const PANTALLAS = [
  { nombre: 'clientes', fichero: 'src/app/dashboard/customers/page.tsx', lista: 'Clientes', editar: 'Editar Cliente', crear: 'Registrar Nuevo Cliente', boton: 'Nuevo Cliente' },
  { nombre: 'suplidores', fichero: 'src/app/dashboard/suppliers/page.tsx', lista: 'Suplidores', editar: 'Editar Suplidor', crear: 'Registrar Nuevo Suplidor', boton: 'Nuevo Suplidor' },
];

function main() {
  for (const p of PANTALLAS) {
    const s = sinComentarios(leer(p.fichero));
    //  Vale en los dos estados: el formulario y su guardado.
    if (!/<form onSubmit=\{handleSubmit\}/.test(s) || !/const openNewModal = \(\) => \{/.test(s)) throw new Error(`Precondicion: ${p.nombre} ya no tiene su formulario de alta`);

    console.log(`\n${p.nombre[0].toUpperCase()}${p.nombre.slice(1)}\n`);
    const pest = (/<PestanasDeRegistro\b[\s\S]*?\n\s*\/>/.exec(s)?.[0] ?? '').replace(/\s+/g, ' ');
    ok(`las pestanas sustituyen al boton "${p.boton}": "Registrar" vacia el formulario, la lista lo cierra`,
      new RegExp(`lista="${p.lista}"`).test(pest) && /enFormulario=\{showModal\}/.test(pest) && /editando=\{!!editId\}/.test(pest)
      && /alVerLista=\{\(\) => setShowModal\(false\)\}/.test(pest) && /alRegistrar=\{openNewModal\}/.test(pest)
      && !new RegExp(`\\n\\s*${p.boton}\\s*</button>`).test(s), pest.slice(0, 100));

    const iLista = s.indexOf('{!showModal && (<>');
    const lista = iLista < 0 ? '' : s.slice(iLista, s.indexOf('</>)}', iLista));
    const iForm = s.indexOf('{showModal && (');
    const form = iForm < 0 ? '' : s.slice(iForm);
    ok('  la lista y el formulario no se pintan a la vez',
      /<SearchBar/.test(lista) && /<Pagination/.test(lista) && !/<form onSubmit=\{handleSubmit\}/.test(lista) && /<form onSubmit=\{handleSubmit\}/.test(form));
    ok('  el formulario ya no es un modal: ni capa sobre la pagina, ni fondo oscuro, ni barra de desplazamiento propia',
      new RegExp(`<PanelDeRegistro titulo=\\{editId \\? '${p.editar}' : '${p.crear}'\\}>`).test(form)
      && !/fixed inset-0|bg-black\/|backdrop-blur|AnimatePresence/.test(s) && !/<form onSubmit=\{handleSubmit\} className="[^"]*(overflow-y-auto|max-h-)/.test(s));
    ok('  "Imprimir" va en la barra de la lista, junto al buscador, y una sola vez',
      /<SearchBar[\s\S]{0,700}onClick=\{handlePrintList\}[\s\S]{0,500}Imprimir/.test(lista) && (s.match(/onClick=\{handlePrintList\}/g) ?? []).length === 1);

    //  Cierto antes y despues: como `ok()` regalaria un OK en la contraprueba.
    invariante('  guardar y cancelar siguen cerrando el formulario, y editar sigue abriendolo con el registro',
      /setShowModal\(false\);/.test(s) && /onClick=\{\(\) => setShowModal\(false\)\}[\s\S]{0,600}Cancelar/.test(form) && (s.match(/setShowModal\(true\);/g) ?? []).length === 2);
    invariante('  el formulario conserva la busqueda en la DGII', /<BotonBuscarDgii\b/.test(form));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
