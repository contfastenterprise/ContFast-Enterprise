/**
 * Lote 250 -- Empresas y Pedidos a suplidor, con pestanas como Compras. Sigue el
 * pedido del dueño (2026-10-02): "haz lo mismo con las demas secciones que tengan
 * nuevo registro; los botones no pueden estar al lado de los tab".
 *
 *  · Empresas (administracion): "Nueva Empresa" y su modal pasan a las pestanas
 *    "Empresas" / "Registrar". Gestionar la suscripcion sigue en su ventana: es
 *    una accion sobre una empresa.
 *  · Pedidos a suplidor: "NUEVO PEDIDO" y su modal de 1.024 px con barra propia,
 *    igual ("Pedidos" / "Registrar"). Ver el detalle y recibir siguen en su
 *    ventana: son acciones sobre un pedido.
 *
 * NO entra, a proposito: las autorizaciones de e-CF. Su alta vive DENTRO de la
 * pestana "Secuencias" de la Central e-CF, que ya tiene sus propias pestanas de
 * contenido (las pantallas que el lote 243 dejo fuera por eso mismo).
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
  const emp = sinComentarios(leer('src/app/dashboard/admin/companies/page.tsx'));
  const ped = sinComentarios(leer('src/app/dashboard/purchases/orders/page.tsx'));
  //  Valen en los dos estados: lo que cada pantalla registra.
  if (!/<form onSubmit=\{handleCreateCompany\}/.test(emp) || !/<form onSubmit=\{handleSaveSubscription\}/.test(emp)) throw new Error('Precondicion: empresas ya no tiene sus formularios');
  if (!/<form onSubmit=\{handleFormSubmit\}/.test(ped) || !/<form onSubmit=\{handleReceiveSubmit\}/.test(ped)) throw new Error('Precondicion: pedidos ya no tiene sus formularios');

  console.log('\nEmpresas\n');
  const pe = pestanas(emp);
  ok('las pestanas sustituyen a "Nueva Empresa": "Registrar" abre el alta y la lista lo cierra',
    /lista="Empresas"/.test(pe) && /enFormulario=\{showNewCompanyModal\}/.test(pe)
    && /alVerLista=\{\(\) => setShowNewCompanyModal\(false\)\}/.test(pe) && /alRegistrar=\{\(\) => setShowNewCompanyModal\(true\)\}/.test(pe)
    && !/\/> Nueva Empresa\s*<\/button>/.test(emp), pe.slice(0, 100));
  const listaE = tramo(emp, '{!showNewCompanyModal && (<>', '</>)}');
  const formE = tramo(emp, '{showNewCompanyModal && (', '</PanelDeRegistro>');
  ok('  el listado y el alta no se pintan a la vez',
    /companies\.map|filteredCompanies\.map|<table/.test(listaE) && !/handleCreateCompany/.test(listaE) && /<form onSubmit=\{handleCreateCompany\}/.test(formE));
  ok('  el alta ya no es un modal: va en la caja de la pestana, y sus botones a su tamano',
    /<PanelDeRegistro titulo="Registrar Empresa">/.test(formE) && !/fixed inset-0/.test(formE) && !/className="flex-1 px-4 py-2/.test(formE)
    && (emp.match(/fixed inset-0/g) ?? []).length === 1);
  invariante('  la suscripcion sigue en su ventana (accion sobre una empresa)', /showSubscriptionModal && selectedCompany && \(/.test(emp));

  console.log('\nPedidos a suplidor\n');
  const pp = pestanas(ped);
  ok('las pestanas sustituyen a "NUEVO PEDIDO": "Registrar" abre el alta, la lista lo cierra, y al editar lo dice',
    /lista="Pedidos"/.test(pp) && /enFormulario=\{showFormModal\}/.test(pp) && /editando=\{!!editId\}/.test(pp)
    && /alVerLista=\{\(\) => setShowFormModal\(false\)\}/.test(pp) && /alRegistrar=\{openNewModal\}/.test(pp)
    && !/NUEVO PEDIDO\s*<\/button>/.test(ped), pp.slice(0, 100));
  const listaP = tramo(ped, '{!showFormModal && (<>', '</>)}');
  const formP = tramo(ped, '{showFormModal && (', '</PanelDeRegistro>');
  ok('  los filtros y la lista no se pintan con el formulario',
    /Filters Bar|No\. Pedido/.test(listaP) && !/handleFormSubmit/.test(listaP) && /<form onSubmit=\{handleFormSubmit\}/.test(formP));
  ok('  el formulario ya no es un modal: ni capa, ni barra de desplazamiento propia',
    /<PanelDeRegistro titulo=\{editId \? 'Editar Pedido a Suplidor' : 'Nuevo Pedido a Suplidor'\}>/.test(formP)
    //  El FORMULARIO y su caja: dentro, el desplegable de la busqueda de productos si lleva su
    //  propio desplazamiento (max-h-[180px]), y es lo que debe.
    && /<form onSubmit=\{handleFormSubmit\} className="space-y-6 text-xs">/.test(formP)
    && !/fixed inset-0|max-h-\[90vh\]/.test(formP) && (ped.match(/fixed inset-0/g) ?? []).length === 2);
  invariante('  ver el detalle y recibir siguen en su ventana (acciones sobre un pedido)',
    /showDetailModal && activeOrder && \(/.test(ped) && /<form onSubmit=\{handleReceiveSubmit\}/.test(ped));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
