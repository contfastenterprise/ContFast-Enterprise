/**
 * Lote 248 -- Retenciones y Bancos, con pestanas como Compras. Pedido del dueño
 * (2026-10-02): "haz lo mismo con las demas secciones que tengan nuevo
 * registro; los botones no pueden estar al lado de los tab".
 *
 *  · Retenciones: el boton "Nueva Retencion" de la cabecera y su modal pasan a
 *    ser las pestanas "Retenciones" / "Registrar". Eliminar sigue siendo una
 *    confirmacion pequena (es una accion sobre una fila, no un registro).
 *  · Bancos: "Nueva Cuenta" y su modal, lo mismo ("Cuentas" / "Registrar").
 *    "Registrar Movimiento" NO es un registro de la pantalla sino una accion
 *    sobre la cuenta elegida: baja de la cabecera a la barra del historial de
 *    esa cuenta, junto a "Imprimir Reporte", y su ventana se queda. Con "Todas
 *    las Cuentas" elegida queda inactivo: un movimiento es de UNA cuenta (antes
 *    se podia pulsar y mandaba `bankAccountId: 'all'`).
 *
 * Que las dos se ven y se usan bien se miro en el navegador; aqui se vigila que
 * ninguna vuelva a ser un modal ni a llevar botones junto a las pestanas (esto
 * ultimo lo barre ademas `verificar_pestanas_solas.ts` en todas las pantallas).
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
/** Cada <label htmlFor="x"> tiene su id="x". */
const etiquetasBien = (src: string, ids: string[]) => ids.every((id) => src.includes(`htmlFor="${id}"`) && src.includes(`id="${id}"`));

function main() {
  const ret = sinComentarios(leer('src/app/dashboard/retentions/page.tsx'));
  const ban = sinComentarios(leer('src/app/dashboard/bank/page.tsx'));
  //  Valen en los dos estados: lo que cada pantalla registra.
  if (!/const handleSubmit = async \(\) => \{/.test(ret) || !/const openCreate = \(\) => \{/.test(ret)) throw new Error('Precondicion: retenciones ya no tiene su alta');
  if (!/<form onSubmit=\{handleCreateAccount\}/.test(ban) || !/<form onSubmit=\{handleRegisterTx\}/.test(ban)) throw new Error('Precondicion: bancos ya no tiene sus dos formularios');

  console.log('\nRetenciones\n');
  const pr = (/<PestanasDeRegistro\b[\s\S]*?\n\s*\/>/.exec(ret)?.[0] ?? '').replace(/\s+/g, ' ');
  ok('las pestanas sustituyen a "Nueva Retención": "Registrar" abre el alta, la lista lo cierra, y al editar lo dice',
    /lista="Retenciones"/.test(pr) && /enFormulario=\{showModal\}/.test(pr) && /editando=\{!!editing\}/.test(pr)
    && /alVerLista=\{\(\) => setShowModal\(false\)\}/.test(pr) && /alRegistrar=\{openCreate\}/.test(pr)
    && !/\n\s*<Plus [^>]*\/> Nueva Retención\s*<\/button>/.test(ret), pr.slice(0, 100));
  const iLr = ret.indexOf('{!showModal && (<>');
  const listaR = iLr < 0 ? '' : ret.slice(iLr, ret.indexOf('</>)}', iLr));
  const iFr = ret.indexOf('{showModal && (');
  const formR = iFr < 0 ? '' : ret.slice(iFr, ret.indexOf('</PanelDeRegistro>', iFr));
  ok('  la lista (grupos y ayuda) y el formulario no se pintan a la vez',
    /grouped\[type\]\.map/.test(listaR) && /¿Cómo se usan estas retenciones\?/.test(listaR) && !/value=\{form\.name\}/.test(listaR) && /value=\{form\.name\}/.test(formR));
  ok('  el formulario ya no es un modal: va en la caja de la pestana, sin capa sobre la pagina',
    /<PanelDeRegistro titulo=\{editing \? 'Editar Retención' : 'Nueva Retención'\}>/.test(formR) && !/fixed inset-0/.test(formR)
    && (ret.match(/fixed inset-0/g) ?? []).length === 1);
  ok('  cada etiqueta con su campo, y los botones no envian nada por su cuenta',
    etiquetasBien(formR, ['ret-nombre', 'ret-tipo', 'ret-porcentaje']) && (formR.match(/type="button"/g) ?? []).length === 2);
  invariante('  eliminar sigue siendo una confirmacion pequena (la unica capa que queda)', /Eliminar retención/.test(ret) && /deleteTarget && \(/.test(ret));

  console.log('\nBancos\n');
  const pb = (/<PestanasDeRegistro\b[\s\S]*?\n\s*\/>/.exec(ban)?.[0] ?? '').replace(/\s+/g, ' ');
  ok('las pestanas sustituyen a "Nueva Cuenta": "Registrar" abre el alta, la lista lo cierra',
    /lista="Cuentas"/.test(pb) && /enFormulario=\{showNewAccountModal\}/.test(pb)
    && /alVerLista=\{\(\) => setShowNewAccountModal\(false\)\}/.test(pb) && /alRegistrar=\{\(\) => setShowNewAccountModal\(true\)\}/.test(pb)
    && !/<Plus [^>]*\/> Nueva Cuenta\s*<\/button>/.test(ban), pb.slice(0, 100));
  const iLb = ban.indexOf('{!showNewAccountModal && (<>');
  const listaB = iLb < 0 ? '' : ban.slice(iLb, ban.indexOf('</>)}', iLb));
  const iFb = ban.indexOf('{showNewAccountModal && (');
  const formB = iFb < 0 ? '' : ban.slice(iFb, ban.indexOf('</PanelDeRegistro>', iFb));
  ok('  las cuentas y el formulario de cuenta nueva no se pintan a la vez',
    /displayAccounts\.map/.test(listaB) && !/handleCreateAccount/.test(listaB) && /<form onSubmit=\{handleCreateAccount\}/.test(formB));
  ok('  la cuenta nueva ya no es un modal: va en la caja de la pestana',
    /<PanelDeRegistro titulo="Nueva Cuenta Bancaria">/.test(formB) && !/fixed inset-0/.test(formB)
    && (ban.match(/fixed inset-0/g) ?? []).length === 1);
  ok('  cada etiqueta con su campo, y la cuenta contable con el estilo de los demas campos',
    etiquetasBien(formB, ['banco-nombre', 'banco-numero', 'banco-moneda', 'banco-tipo', 'banco-color', 'banco-cuenta-contable', 'banco-balance'])
    && !/border-slate-300 bg-white py-2 px-3 text-sm/.test(formB));
  const barra = /Historial de Transacciones[\s\S]*?Imprimir Reporte/.exec(listaB)?.[0] ?? '';
  ok('"Registrar Movimiento" baja a la barra del historial de la cuenta, junto a "Imprimir Reporte", y una sola vez',
    /onClick=\{\(\) => setShowTxModal\(true\)\}[\s\S]{0,700}Registrar Movimiento/.test(barra)
    && (ban.match(/setShowTxModal\(true\)/g) ?? []).length === 1);
  ok('  y con "Todas las Cuentas" elegida no se puede pulsar (un movimiento es de UNA cuenta)',
    /disabled=\{selectedAccount\.id === 'all'\}[\s\S]{0,300}onClick=\{\(\) => setShowTxModal\(true\)\}/.test(barra));
  invariante('  el movimiento sigue en su ventana (es una accion sobre la cuenta elegida, no un registro de la pantalla)',
    /showTxModal && selectedAccount && \(/.test(ban) && /<form onSubmit=\{handleRegisterTx\}/.test(ban));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
