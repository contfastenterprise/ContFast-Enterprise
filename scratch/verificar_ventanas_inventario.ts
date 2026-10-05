/**
 * Lote 277 -- las ventanas escritas a mano del grupo INVENTARIO pasan a la ventana de la casa
 * (`Modal`, `src/components/ui/dialog.tsx`, lote 276).
 *
 * Una "ventana escrita a mano" es un `fixed inset-0` con fondo oscuro y una caja encima. En el grupo
 * (productos, codigos de barra, almacenes, inventario, conduces y notas de credito/debito) habia SIETE:
 *
 *   products/page.tsx           Nueva Categoría, Edición Manual de Precios, Inventario: <producto>,
 *                               Generar Etiquetas de Código de Barras
 *   products/barcodes/page.tsx  Generar Etiquetas de Código de Barras
 *   adjustments/page.tsx        Vincular Factura Afectada
 *   delivery-notes/components/BuscadorDeFacturas.tsx   Buscar Facturas Pendientes de Despacho
 *
 * Sin cambiar lo que hacen: la misma variable las abre, el mismo manejador las cierra. Lo que este
 * banco vigila, ventana por ventana:
 *  · ya no hay `fixed inset-0` de ventana en el grupo;
 *  · cada una es un `<Modal>` con su `title`, su `isOpen` y su `onClose` de antes;
 *  · pulsar fuera hace lo mismo que antes: las cinco cuyo fondo cerraba lo siguen haciendo (el valor
 *    por defecto), y las dos cuyo fondo NO cerraba (las dos busquedas de factura) llevan
 *    `cerrarAlPulsarFuera={false}`;
 *  · `bloqueada` donde hay un estado de guardando: categoria nueva (`submittingCategory`) e
 *    inventario por almacen (`submittingAdjustId`/`submittingLimitId`);
 *  · las dos de etiquetas conservan `no-print` (la impresion esconde la ventana);
 *  · la del inventario solo arma su cuerpo con el producto puesto (lo lee al pintarse).
 *
 * NO son ventanas, y se quedan (no tienen fondo ni caja: son la capa transparente que cierra un
 * desplegable al pulsar fuera de el):
 *  · products/page.tsx, el desplegable "Más opciones de impresión" (`setPrintDropdownOpen(false)`);
 *  · inventory/transfer/page.tsx, el buscador de producto (`setIsOpen(false)`).
 * Van como precondicion: si alguien les pone fondo, el banco no puede decidir y se niega.
 *
 * Y como INVARIANTE (codigo 3): los textos, `placeholder`, `title`, avisos y direcciones de la API de
 * cada fichero son los de la base (`ab9e5fd`). El titulo de una ventana pasa de texto de su `<h3>` a
 * propiedad `title` del `Modal`: cuenta como el mismo texto.
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ventanas_inventario.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { huella, diferencia } from './huellaDePantalla';

const raiz = resolve(__dirname, '..');
const BASE = 'ab9e5fd';
const DIRS = ['src/app/dashboard/products', 'src/app/dashboard/warehouses', 'src/app/dashboard/inventory', 'src/app/dashboard/delivery-notes', 'src/app/dashboard/adjustments'];
const P = 'src/app/dashboard/products/page.tsx';
const B = 'src/app/dashboard/products/barcodes/page.tsx';
const A = 'src/app/dashboard/adjustments/page.tsx';
const F = 'src/app/dashboard/delivery-notes/components/BuscadorDeFacturas.tsx';
const T = 'src/app/dashboard/inventory/transfer/page.tsx';

interface Ventana {
  fichero: string;
  nombre: string;
  abierta: RegExp;
  cierre: RegExp;
  /** Su fondo cerraba la ventana al pulsarlo (antes: `onClick` en el fondo). */
  cerrabaFuera: boolean;
  bloqueada?: RegExp;
  noPrint?: boolean;
}
const sp = String.raw`\s*`;
const VENTANAS: Ventana[] = [
  { fichero: P, nombre: 'Nueva Categoría', abierta: /^showCategoryModal$/, cierre: /^\(\)\s*=>\s*setShowCategoryModal\(false\)$/, cerrabaFuera: true, bloqueada: /^submittingCategory$/ },
  { fichero: P, nombre: 'Edición Manual de Precios', abierta: /^showPricesModal$/, cierre: /^\(\)\s*=>\s*setShowPricesModal\(false\)$/, cerrabaFuera: true },
  { fichero: P, nombre: 'Inventario:', abierta: /^showInventoryModal\s*&&\s*!!selectedProduct$/, cierre: /^\(\)\s*=>\s*setShowInventoryModal\(false\)$/, cerrabaFuera: true,
    bloqueada: new RegExp(`^submittingAdjustId${sp}!==${sp}null${sp}\\|\\|${sp}submittingLimitId${sp}!==${sp}null$`) },
  { fichero: P, nombre: 'Generar Etiquetas de Código de Barras', abierta: /^showLabelModal$/, cierre: /^\(\)\s*=>\s*setShowLabelModal\(false\)$/, cerrabaFuera: true, noPrint: true },
  { fichero: B, nombre: 'Generar Etiquetas de Código de Barras', abierta: /^showLabelModal$/, cierre: /^\(\)\s*=>\s*setShowLabelModal\(false\)$/, cerrabaFuera: true, noPrint: true },
  { fichero: A, nombre: 'Vincular Factura Afectada', abierta: /^showInvoiceSearch$/, cierre: /^\(\)\s*=>\s*setShowInvoiceSearch\(false\)$/, cerrabaFuera: false },
  { fichero: F, nombre: 'Buscar Facturas Pendientes de Despacho', abierta: /^f\.showInvoiceSearch$/, cierre: /^\(\)\s*=>\s*f\.setShowInvoiceSearch\(false\)$/, cerrabaFuera: false },
];
//  Las dos capas transparentes de desplegable que NO son ventanas (ver cabecera).
const CAPAS_DE_DESPLEGABLE: [string, string][] = [[P, 'setPrintDropdownOpen(false)'], [T, 'setIsOpen(false)']];

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');
const enBase = (p: string) => execFileSync('git', ['show', `${BASE}:${p}`], { cwd: raiz, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const blanco = (x: string) => x.replace(/[^\n]/g, ' ');
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blanco).replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/(^|[^:])(\/\/[^\n]*)/g, (_x, a: string, b: string) => a + blanco(b));

function ficheros(): string[] {
  const out: string[] = [];
  const andar = (d: string) => {
    for (const n of readdirSync(join(raiz, d)).sort()) {
      const r = `${d}/${n}`;
      if (statSync(join(raiz, r)).isDirectory()) andar(r);
      else if (r.endsWith('.tsx')) out.push(r);
    }
  };
  DIRS.forEach(andar);
  return out;
}

/** La etiqueta de apertura de cada `<Modal`, contando llaves (un `icono={<X />}` lleva un `>`). */
function modales(src: string): { abre: string; props: Map<string, string>; linea: number }[] {
  const out: { abre: string; props: Map<string, string>; linea: number }[] = [];
  const re = /<Modal\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const abre = src.slice(m.index, k + 1);
    const props = new Map<string, string>();
    //  Cada propiedad: nombre="..." o nombre={...} (con llaves anidadas) o nombre a secas (true).
    let i = '<Modal'.length;
    while (i < abre.length) {
      const pm = /^\s*([A-Za-z]\w*)(=?)/.exec(abre.slice(i));
      if (!pm || !pm[1]) { i++; continue; }
      const nombre = pm[1];
      i += pm[0].length;
      if (!pm[2]) { props.set(nombre, 'true'); continue; }
      if (abre[i] === '"') { const f = abre.indexOf('"', i + 1); props.set(nombre, abre.slice(i + 1, f)); i = f + 1; continue; }
      if (abre[i] === '{') {
        let p = 0, j = i;
        for (; j < abre.length; j++) { if (abre[j] === '{') p++; else if (abre[j] === '}') { p--; if (p === 0) break; } }
        props.set(nombre, abre.slice(i + 1, j).trim());
        i = j + 1;
      }
    }
    out.push({ abre, props, linea: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** El texto del titulo: "X" a pelo, o el texto de un fragmento `<>X {expr}</>`. */
const textoDelTitulo = (t: string | undefined) => (t ?? '').replace(/^<>/, '').replace(/<\/>$/, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

/** La huella visible (lotes 253-255) sin clases ni aria-label; el `title` de un `<Modal` cuenta como texto. */
function visibles(src: string): string[] {
  const titulos = modales(sinComentarios(src.replace(/\r\n/g, '\n'))).map((v) => v.props.get('title')).filter((t): t is string => !!t && !t.startsWith('<'));
  const h = huella(src).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:'));
  for (const t of titulos) {
    const i = h.indexOf(`title:${t}`);
    if (i >= 0) h.splice(i, 1, `texto:${t}`);
  }
  return h.sort();
}

async function main() {
  const todos = ficheros();
  for (const v of VENTANAS) if (!todos.includes(v.fichero)) throw new Error(`Precondicion: no esta ${v.fichero}`);
  if (!todos.includes(T)) throw new Error(`Precondicion: no esta ${T}`);
  const fuente = new Map(todos.map((f) => [f, sinComentarios(leer(f))]));

  //  Precondicion, cierta en los dos estados: las dos capas de desplegable siguen siendo transparentes.
  for (const [f, cierre] of CAPAS_DE_DESPLEGABLE) {
    const ls = (fuente.get(f) ?? '').split('\n');
    //  La linea de la clase y las dos siguientes (el `onClick` puede ir en la misma o en la de abajo).
    const i = ls.findIndex((l, k) => /className="fixed inset-0/.test(l) && ls.slice(k, k + 3).join('\n').includes(cierre));
    const cls = i >= 0 ? /className="([^"]*)"/.exec(ls[i])?.[1] ?? '' : '';
    if (i < 0 || /\bbg-|backdrop-blur|items-center/.test(cls)) throw new Error(`Precondicion: la capa del desplegable de ${f} (${cierre}) no esta o ya no es transparente`);
  }

  console.log('\n1) Ninguna ventana escrita a mano en el grupo\n');
  const aMano: string[] = [];
  for (const [f, s] of fuente) {
    s.split('\n').forEach((l, i) => {
      const cls = /className="(fixed inset-0[^"]*)"/.exec(l)?.[1];
      if (!cls) return;
      //  Una ventana: fondo oscuro, desenfoque o caja centrada. Las capas de desplegable no tienen nada de eso.
      if (/\bbg-|backdrop-blur|items-center|justify-center/.test(cls)) aMano.push(`${f.replace('src/app/dashboard/', '')}:${i + 1}`);
    });
  }
  ok('ningun `fixed inset-0` con fondo o caja centrada en los ficheros del grupo', aMano.length === 0, aMano.join(', '));
  //  Solo los ficheros que tenian ventana: `inventory/movements` y `transfer` ya importaban `motion` sin
  //  usarlo antes del lote, y no es asunto de este.
  const conVentana = new Set(VENTANAS.map((v) => v.fichero));
  const conFramerSinUso = [...fuente.entries()].filter(([f]) => conVentana.has(f)).filter(([, s]) => {
    const imp = /import\s*\{([^}]*)\}\s*from 'framer-motion'/.exec(s);
    if (!imp) return false;
    const resto = s.replace(imp[0], '');
    return imp[1].split(',').map((x) => x.trim()).filter(Boolean).some((n) => !new RegExp(`\\b${n}\\b`).test(resto));
  }).map(([f]) => f.replace('src/app/dashboard/', ''));
  //  Cierto antes (alli se usaba) y despues: invariante, para que no quede un resto al quitar la ventana.
  invariante('ningun AnimatePresence/motion importado sin uso en los ficheros con ventana', conFramerSinUso.length === 0, conFramerSinUso.join(', '));
  const sinFramer = [B, F].filter((f) => /from 'framer-motion'/.test(fuente.get(f) ?? ''));
  ok('  codigos de barra y el buscador de facturas ya no importan framer-motion (solo lo usaba la ventana)', sinFramer.length === 0, sinFramer.join(', '));

  console.log('\n2) Cada ventana es un <Modal>, con lo que hacia\n');
  const sinImport = [...new Set(VENTANAS.map((v) => v.fichero))].filter((f) => !/import \{ Modal \} from '@\/components\/ui\/dialog';/.test(fuente.get(f) ?? ''));
  ok('los cuatro ficheros importan Modal de @/components/ui/dialog', sinImport.length === 0, sinImport.join(', '));
  const porFichero = new Map<string, ReturnType<typeof modales>>();
  for (const f of new Set(VENTANAS.map((v) => v.fichero))) porFichero.set(f, modales(fuente.get(f) ?? ''));
  const totalModales = [...porFichero.values()].reduce((n, xs) => n + xs.length, 0);
  ok(`siete <Modal> en el grupo, uno por ventana`, totalModales === VENTANAS.length, `${totalModales}`);
  const sinTitulo = [...porFichero.entries()].flatMap(([f, xs]) => xs.filter((x) => !x.props.get('title')).map((x) => `${f.split('/').pop()}:${x.linea}`));
  ok('cada <Modal> lleva title', totalModales > 0 && sinTitulo.length === 0, sinTitulo.join(', '));

  for (const v of VENTANAS) {
    const x = (porFichero.get(v.fichero) ?? []).find((m) => v.abierta.test(m.props.get('isOpen') ?? ''));
    const corto = `${v.fichero.split('/').slice(-2).join('/')} "${v.nombre}"`;
    ok(`${corto}: se abre con la misma variable`, !!x, x ? '' : 'no hay <Modal> con ese isOpen');
    if (!x) { ok(`${corto}: titulo, cierre y pulsar fuera`, false, 'sin ventana'); continue; }
    ok(`  su titulo es el de antes`, textoDelTitulo(x.props.get('title')).startsWith(v.nombre), x.props.get('title') ?? '');
    ok(`  onClose es lo que hacia su X`, v.cierre.test(x.props.get('onClose') ?? ''), x.props.get('onClose') ?? '(sin onClose)');
    const fuera = x.props.get('cerrarAlPulsarFuera');
    ok(v.cerrabaFuera ? '  su fondo cerraba: sigue cerrando (cerrarAlPulsarFuera por defecto)' : '  su fondo NO cerraba: cerrarAlPulsarFuera={false}',
      v.cerrabaFuera ? (fuera === undefined || fuera === 'true') : fuera === 'false', String(fuera));
    if (v.bloqueada) ok('  mientras guarda no se cierra (bloqueada)', v.bloqueada.test(x.props.get('bloqueada') ?? ''), x.props.get('bloqueada') ?? '(sin bloqueada)');
    if (v.noPrint) ok('  conserva no-print (la impresion la esconde)', x.props.get('className') === 'no-print', x.props.get('className') ?? '');
  }
  //  La del inventario lee `selectedProduct.unitOfMeasure` al pintarse: su cuerpo solo con el producto.
  const p = fuente.get(P) ?? '';
  const iInv = p.search(/isOpen=\{showInventoryModal/);
  ok('la de inventario solo arma su cuerpo con el producto puesto', iInv > 0 && /^[^]*?>\s*\{selectedProduct && \(/.test(p.slice(iInv, iInv + 1200)));

  console.log('\n3) Dibujada: el buscador de facturas del conduce\n');
  try {
    const mod = await import('../src/app/dashboard/delivery-notes/components/BuscadorDeFacturas');
    const nada = () => {};
    const f = {
      showInvoiceSearch: true, setShowInvoiceSearch: nada, invoiceSearchQuery: '', setInvoiceSearchQuery: nada,
      handleSearchInvoices: nada, invoicesLoading: false, invoicesList: [{ id: 'i1', ncf: 'E310000000001', buyerName: 'Cliente', total: 100 }], handleSelectInvoice: nada,
    };
    const abierta = renderToStaticMarkup(React.createElement(mod.BuscadorDeFacturas, { formulario: f } as never));
    const cerrada = renderToStaticMarkup(React.createElement(mod.BuscadorDeFacturas, { formulario: { ...f, showInvoiceSearch: false } } as never));
    ok('  abierta, se anuncia como ventana (role="dialog", aria-modal) con su titulo enlazado',
      /role="dialog"/.test(abierta) && /aria-modal="true"/.test(abierta) && /aria-labelledby="[^"]+"/.test(abierta) && /<h2[^>]*>[\s\S]*Buscar Facturas Pendientes de Despacho/.test(abierta));
    ok('  y la X de la casa dice que cierra', /<button[^>]*aria-label="Cerrar"[^>]*title="Cerrar \(Esc\)"/.test(abierta));
    invariante('  la factura sigue en la lista con su NCF, y cerrada no pinta nada', /E310000000001/.test(abierta) && cerrada === '');
  } catch (e) {
    ok('  abierta, se anuncia como ventana (role="dialog", aria-modal) con su titulo enlazado', false, `lanzo: ${(e as Error).message}`);
    ok('  y la X de la casa dice que cierra', false, 'lanzo');
  }

  console.log('\n4) Lo que no cambia (invariantes)\n');
  const cambiados: string[] = [];
  for (const f of todos) {
    let antes: string;
    try { antes = enBase(f); } catch { continue; }
    //  LOTE 285: DOS COMMITS, no la carpeta (como en los lotes 227 y 230). El 285 pide a proposito una
    //  ruta nueva desde productos (la tarjeta "Stock Bajo"); la prueba de este lote sigue siendo la
    //  misma entre ab9e5fd y 696854e, el ultimo main en que se comprobo.
    let despues: string;
    try { despues = execFileSync('git', ['show', `696854e:${f}`], { cwd: raiz, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/\r\n/g, '\n'); } catch { continue; }
    const d = diferencia(visibles(antes), visibles(despues));
    if (d.faltan.length || d.sobran.length) cambiados.push(`${f.replace('src/app/dashboard/', '')}: faltan ${JSON.stringify(d.faltan.slice(0, 3))} sobran ${JSON.stringify(d.sobran.slice(0, 3))}`);
  }
  invariante(`los textos, placeholder, title, avisos y direcciones de la API de los ${todos.length} ficheros son los de ${BASE}`, cambiados.length === 0, cambiados.join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
