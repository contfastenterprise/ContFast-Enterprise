/**
 * Lote 249 -- Empleados y Horas extra (RRHH), con pestanas como Compras. Sigue el
 * pedido del dueño (2026-10-02): "haz lo mismo con las demas secciones que tengan
 * nuevo registro; los botones no pueden estar al lado de los tab".
 *
 *  · Empleados: "Agregar Empleado" y su modal de 672 px con barra propia pasan a
 *    las pestanas "Empleados" / "Registrar".
 *  · Horas extra: "Nuevo Registro" y su modal, igual ("Novedades" / "Registrar").
 *    La pantalla ya tenia sus pestanas de CONTENIDO (horas extra, ingresos,
 *    deducciones): se quedan dentro de la lista, y lo que se registra es del tipo
 *    de la que estaba elegida -- el titulo del formulario lo dice. El boton de
 *    recargar baja de la cabecera a la fila de esas pestanas.
 *
 * NO entran, a proposito: Departamentos y Puestos (dos altas pequenas, de dos
 * campos, cada una con su "Agregar" dentro de su tarjeta: son los "modales
 * pequenos" del lote 240) y Liquidaciones (no tiene modal: el calculo ya vive en
 * la pagina, junto a su historico).
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
const pestanas = (s: string) => (/<PestanasDeRegistro\b[\s\S]*?\n\s*\/>/.exec(s)?.[0] ?? '').replace(/\s+/g, ' ');
const tramo = (s: string, desde: string, hasta: string) => { const i = s.indexOf(desde); return i < 0 ? '' : s.slice(i, s.indexOf(hasta, i)); };

function main() {
  const emp = sinComentarios(leer('src/app/dashboard/hr/employees/page.tsx'));
  const ot = sinComentarios(leer('src/app/dashboard/hr/overtime/page.tsx'));
  //  Valen en los dos estados: lo que cada pantalla registra.
  if (!/<form onSubmit=\{handleSubmit\}/.test(emp) || !/const handleOpenCreate = \(\) => \{/.test(emp)) throw new Error('Precondicion: empleados ya no tiene su alta');
  if (!/<form onSubmit=\{handleSubmit\}/.test(ot) || !/const handleOpenModal = \(\) => \{/.test(ot)) throw new Error('Precondicion: horas extra ya no tiene su alta');

  console.log('\nEmpleados\n');
  const pe = pestanas(emp);
  ok('las pestanas sustituyen a "Agregar Empleado": "Registrar" abre el alta, la lista lo cierra, y al editar lo dice',
    /lista="Empleados"/.test(pe) && /enFormulario=\{showModal\}/.test(pe) && /editando=\{!!editId\}/.test(pe)
    && /alVerLista=\{\(\) => setShowModal\(false\)\}/.test(pe) && /alRegistrar=\{handleOpenCreate\}/.test(pe)
    && !/Agregar Empleado\s*<\/button>/.test(emp), pe.slice(0, 100));
  const listaE = tramo(emp, '{!showModal && (<>', '</>)}');
  const formE = tramo(emp, '{showModal && (', '</PanelDeRegistro>');
  ok('  la lista (buscador, tabla, paginacion) y el formulario no se pintan a la vez',
    /<SearchBar/.test(listaE) && /<Pagination/.test(listaE) && !/<form onSubmit/.test(listaE) && /<form onSubmit=\{handleSubmit\}/.test(formE));
  ok('  el formulario ya no es un modal: ni capa sobre la pagina, ni barra de desplazamiento propia',
    /<PanelDeRegistro titulo=\{editId \? 'Editar Empleado' : 'Registrar Nuevo Empleado'\}>/.test(formE)
    && !/fixed inset-0|max-h-\[90vh\]|overflow-y-auto/.test(formE) && !/fixed inset-0/.test(emp));
  invariante('  el formulario conserva sus dos secciones', /1\. Datos Personales/.test(formE) && /2\. Datos Laborales/.test(formE));

  console.log('\nHoras extra, ingresos y deducciones\n');
  const po = pestanas(ot);
  ok('las pestanas sustituyen a "Nuevo Registro": "Registrar" abre el alta y la lista lo cierra',
    /lista="Novedades"/.test(po) && /enFormulario=\{showModal\}/.test(po)
    && /alVerLista=\{\(\) => setShowModal\(false\)\}/.test(po) && /alRegistrar=\{handleOpenModal\}/.test(po)
    && !/\n\s*Nuevo Registro\s*<\/button>/.test(ot), po.slice(0, 100));
  const cabecera = tramo(ot, '<h1', '{!showModal && (<>');
  ok('  en la cabecera no queda ningun boton: recargar baja a la fila de las pestanas de contenido',
    cabecera.length > 0 && !/<button/.test(cabecera)
    && /aria-label="Tabs"[\s\S]*?<\/nav>\s*<button[\s\S]{0,120}onClick=\{fetchData\}/.test(ot));
  const listaO = tramo(ot, '{!showModal && (<>', '</>)}');
  const formO = tramo(ot, '{showModal && (', '</PanelDeRegistro>');
  ok('  las tarjetas, las pestanas de contenido y la tabla no se pintan con el formulario',
    /Horas Extras Pendientes/.test(listaO) && /aria-label="Tabs"/.test(listaO) && !/<form onSubmit/.test(listaO) && /<form onSubmit=\{handleSubmit\}/.test(formO));
  ok('  el formulario va en la caja de la pestana, y su titulo dice el tipo que se registra',
    /<PanelDeRegistro titulo=\{`Agregar \$\{activeTab === 'overtime' \? 'Horas Extras' : activeTab === 'income' \? 'Ingreso Adicional' : 'Deducción'\}`\}>/.test(formO)
    && !/fixed inset-0/.test(ot));
  invariante('  lo registrado sigue siendo del tipo de la pestana de contenido', /entryType: activeTab/.test(ot));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
