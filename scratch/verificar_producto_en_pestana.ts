/**
 * Lote 240 -- registrar o editar un producto es una PESTANA de la pagina, no un
 * modal. Pedido del dueño (2026-10-02): "el formulario de producto ponlo mas
 * grande, para que no sea necesario usar scroll, por lo menos en pantalla
 * grande", y enseguida: "o mejor ponlo igual que compras, con tab".
 *
 * Era un modal de 768 px con `max-h-[90vh]` y su propia barra de
 * desplazamiento. Ahora ocupa el ancho de la pagina: por pasos, cada paso solo;
 * y "todo de una vez" (que es como se EDITA), en dos columnas en pantalla
 * grande.
 *
 * Que cabe no lo dice un banco: se midio en el navegador con la pagina de
 * verdad y la red sustituida (1.440 x 900: el formulario entero acaba en el
 * pixel 813, sin barra propia; a 1.280 x 720 se desplaza la PAGINA, no una
 * caja). Aqui se vigila que no vuelva a ser un modal.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

const PAGINA = 'src/app/dashboard/products/page.tsx';

function main() {
  const p = sinComentarios(leer(PAGINA).replace(/\r\n/g, '\n'));
  //  Vale en los dos estados: el formulario de producto con sus tres pasos.
  if (!/<form onSubmit=\{handleSubmit\}/.test(p) || !/\{paso === 1 && paso1\(\)\}/.test(p)) throw new Error('Precondicion: la pagina de productos ya no tiene su formulario por pasos');

  console.log('\n1) El formulario no es un modal\n');
  const iForm = p.indexOf('<form onSubmit={handleSubmit}');
  const etiquetaForm = p.slice(iForm, p.indexOf('>', iForm) + 1);
  //  Lo que envuelve al formulario: desde la condicion que lo pinta hasta el.
  const iCond = p.lastIndexOf('{showModal && (', iForm);
  const envoltorio = iCond < 0 ? 'X fixed inset-0' : p.slice(iCond, iForm);
  ok('el formulario no tiene barra de desplazamiento propia ni tope de alto',
    !/overflow-y-auto|max-h-/.test(etiquetaForm) && !/max-h-\[\d+vh\]|overflow-hidden/.test(envoltorio), etiquetaForm);
  ok('  ni vive en una capa sobre la pagina: nada de `fixed inset-0`, ni fondo oscuro, ni cerrar al pulsar fuera',
    iCond > 0 && !/fixed inset-0|bg-black\/|backdrop-blur/.test(envoltorio) && /Registrar Nuevo Producto/.test(envoltorio));

  console.log('\n2) Las pestanas, como en Compras\n');
  //  Lote 242: las pestanas son el componente compartido (`pestanas-de-registro.tsx`, lote 241). Que dibuja --dos
  //  botones, cual es la activa, que ninguno envia un formulario-- lo ejecuta `verificar_inventario_en_pestanas.ts`;
  //  aqui se mira que productos le pase lo suyo.
  const pestanas = (/<PestanasDeRegistro\b[\s\S]*?\n\s*\/>/.exec(p)?.[0] ?? '').replace(/\s+/g, ' ');
  ok('dos pestanas: "Catálogo" vuelve a la lista y "Registrar" abre un producto nuevo',
    /lista="Catálogo"/.test(pestanas) && /alVerLista=\{\(\) => \{ setErrores\(\{\}\); setShowModal\(false\);[^}]*\}\}/.test(pestanas)
    && /alRegistrar=\{openNewModal\}/.test(pestanas), pestanas.slice(0, 110));
  ok('  la activa sale de si el formulario esta abierto, y al editar lo dice',
    /enFormulario=\{showModal\}/.test(pestanas) && /editando=\{!!editId\}/.test(pestanas));
  ok('  y son las del componente compartido, no una copia a mano',
    /import \{ PestanasDeRegistro, PanelDeRegistro \} from '@\/components\/ui\/pestanas-de-registro';/.test(p) && !/aria-pressed=/.test(p)
    && /<PanelDeRegistro titulo=\{editId \? 'Editar Producto' : 'Registrar Nuevo Producto'\}>/.test(p));
  ok('  y el boton suelto "Nuevo Producto" ya no esta (seria la misma accion dos veces)', 
    //  El texto del BOTON, no el titulo del formulario ("Registrar Nuevo Producto").
    pestanas.length > 0 && !/\n\s*Nuevo Producto\s*<\/button>/.test(p));

  console.log('\n3) El catalogo y el formulario no se pintan a la vez\n');
  const iLista = p.indexOf('{!showModal && !enDolar && (<>'); // lote 247: tampoco mientras se ven los precios en dolares
  const iFin = p.indexOf('</>)}', iLista);
  const lista = iLista < 0 || iFin < 0 ? '' : p.slice(iLista, iFin);
  ok('las tarjetas, el buscador, la tabla y la paginacion solo salen en la pestana del catalogo',
    /Total en Catálogo/.test(lista) && /<SearchBar/.test(lista) && /<Pagination/.test(lista) && !/<form onSubmit=\{handleSubmit\}/.test(lista));

  console.log('\n4) "Todo de una vez", en columnas\n');
  const form = p.slice(iForm, p.indexOf('</form>', iForm));
  const completa = /\{vistaCompleta \? \(\s*<div className="([^"]*)">\s*<section[^>]*>\s*\{paso1\(\)\}\s*\{paso3\(\)\}\s*<\/section>\s*<section[^>]*>\s*\{paso2\(\)\}\s*<\/section>\s*<\/div>/.exec(form)?.[1].split(' ') ?? [];
  ok('en pantalla grande van dos columnas: que es y sus codigos de barra | precios y existencia',
    completa.includes('grid') && completa.includes('grid-cols-1') && completa.includes('lg:grid-cols-2') && completa.includes('items-start'), completa.join(' ') || 'no hay columnas');
  ok('  y los cuatro precios de venta van de dos en dos ahi (en media columna, de cuatro en cuatro se pisan las etiquetas)',
    /className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-2"/.test(p));

  console.log('\n5) Lo que no cambia\n');
  //  Cierto antes y despues: como `ok()` regalaria un OK en la contraprueba.
  invariante('por pasos se sigue pintando UN paso cada vez', /\{paso === 1 && paso1\(\)\}\s*\{paso === 2 && paso2\(\)\}\s*\{paso === 3 && paso3\(\)\}/.test(form));
  invariante('guardar y cancelar siguen cerrando el formulario, y editar sigue abriendo todo de una vez',
    //  LOTE 275: desde el 271 el pie es `AccionesDeFormulario`, que pone el texto "Cancelar" el mismo y
    //  recibe el manejador como `alCancelar`. Se ancla la PROPIEDAD (cancelar limpia los errores y cierra),
    //  con `onClick` o `alCancelar`; antes del 271 era un boton con su texto.
    (/onClick=\{\(\) => \{ setErrores\(\{\}\); setShowModal\(false\); \}\}[\s\S]*?Cancelar/.test(form)
      || /<AccionesDeFormulario\b[\s\S]{0,400}?alCancelar=\{\(\) => \{ setErrores\(\{\}\); setShowModal\(false\); \}\}/.test(form))
    && /setVistaCompleta\(true\);[\s\S]{0,200}setShowModal\(true\);/.test(p));
  invariante('los modales pequeños (categoria nueva, codigos, impresion) siguen siendo modales', (p.match(/fixed inset-0 z-\[\d+\]/g) ?? []).length >= 4);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
