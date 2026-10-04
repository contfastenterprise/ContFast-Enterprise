/**
 * Lote 278 -- las ventanas escritas a mano del grupo VENTAS pasan a la ventana de la casa (`Modal`,
 * `src/components/ui/dialog.tsx`, lote 276).
 *
 * Ventanas (10): facturas (detalle de la factura, registrar nuevo cliente, confirmar impresion), la
 * central e-CF (nueva autorizacion y editar secuencia SACF), la edicion de cotizaciones (buscar
 * producto y buscar cliente), cuentas por cobrar (registrar recibo de cobro y detalle del recibo) y el
 * estado de cuenta de la cartera (`components/cartera/ModalEstadoCuenta.tsx`).
 *
 * Facturas y e-CF son documentos fiscales: cambia SOLO la ventana. Lo que pasa al confirmar (emitir e
 * imprimir, notas de credito/debito, reenviar el correo, registrar el cliente, guardar la secuencia,
 * procesar el recibo) va de INVARIANTE: las mismas llamadas, las mismas veces, que en la base.
 *
 * Lo que vigila:
 *   1. En los ficheros del grupo no queda ninguna ventana escrita a mano (`fixed inset-0` con fondo o
 *      caja). Lo unico `fixed inset-0` que queda son las TRES capas transparentes que cierran el
 *      desplegable de guardar (factura, alta y edicion de cotizacion): no son ventanas, no tapan nada,
 *      y se cuentan por fichero (una de mas tampoco pasa).
 *      Excepciones (ventanas que se dejan a mano): NINGUNA.
 *   2. Cada fichero importa `Modal` de `@/components/ui/dialog` y lo usa; cada `<Modal` lleva `title`.
 *   3. Por ventana: su `onClose` es exactamente lo que hacia su X; `cerrarAlPulsarFuera={false}` en las
 *      que antes NO cerraban al pulsar el fondo (las dos busquedas de la cotizacion: su fondo no tenia
 *      `onClick`), y ninguna de las demas lo lleva (su fondo cerraba); `bloqueada` en las que guardan.
 *   4. Nada de `AnimatePresence`/`motion` importado sin uso; y el estado de cuenta deja su oyente de
 *      Escape propio (ahora lo hace la ventana, y solo si es la de arriba).
 *   INVARIANTE: textos, `placeholder`, `title`, avisos y direcciones de la API de cada fichero iguales a
 *   la base (`origin/lote-276-ventana-comun`); lo que pasa a `title="..."` del Modal cuenta como el
 *   mismo texto. Los dos titulos NUEVOS (las busquedas no tenian) se nombran: "Buscar Producto" y
 *   "Buscar Cliente".
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ventanas_ventas.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const raiz = resolve(__dirname, '..');
//  Commit fijo y no la rama: la rama se borra al fusionar (lote 260/282), y un banco que nombra una rama
//  borrada revienta en cuanto alguien hace `git fetch --prune` o clona de cero.
const BASE = 'ab9e5fd'; // lote 276, la base del 278
const LOTE = 'ef2039b'; // lote 278
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

const FAC = 'src/app/dashboard/invoices/page.tsx';
const ECF = 'src/app/dashboard/ecf/page.tsx';
const COT_EDIT = 'src/app/dashboard/quotes/[id]/edit/page.tsx';
const COT_NEW = 'src/app/dashboard/quotes/new/page.tsx';
const CXC = 'src/app/dashboard/receivables/page.tsx';
const EDO = 'src/components/cartera/ModalEstadoCuenta.tsx';
const CON_VENTANA = [FAC, ECF, COT_EDIT, CXC, EDO];

const DIRS = [
  'src/app/dashboard/invoices', 'src/app/dashboard/quotes', 'src/app/dashboard/customers',
  'src/app/dashboard/receivables', 'src/app/dashboard/receivables-report', 'src/app/dashboard/ecf', 'src/components/cartera',
];
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
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
const blanco = (x: string) => x.replace(/[^\n]/g, ' ');
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blanco).replace(/\/\*[\s\S]*?\*\//g, blanco)
  .replace(/(^|[^:])(\/\/[^\n]*)/g, (_x, a: string, b: string) => a + blanco(b));
const linea = (s: string, i: number) => s.slice(0, i).split('\n').length;

/** Los atributos de cada `<Modal ...>` (respetando las llaves: `icono={<X />}` lleva un `>`). */
function modales(s: string): { attrs: string; inicio: number; cuerpo: string }[] {
  const out: { attrs: string; inicio: number; cuerpo: string }[] = [];
  const re = /<Modal\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const fin = s.indexOf('</Modal>', k);
    out.push({ attrs: s.slice(m.index, k), inicio: m.index, cuerpo: s.slice(k + 1, fin < 0 ? undefined : fin) });
  }
  return out;
}
/** Una "ventana a mano": `fixed inset-0` con fondo oscuro o que centra una caja. */
const VENTANA_A_MANO = /className=["'`{][^"'`]*\bfixed inset-0\b[^"'`]*["'`]/g;
const esCapaTransparente = (cls: string) => /^className=["'`]fixed inset-0 z-30["'`]$/.test(cls);

type Esperada = { fichero: string; titulo: RegExp; onClose: string; fuera: boolean; bloqueada?: string };
/** Las diez ventanas, con lo que hacia cada una (leido de la base, una a una). */
const VENTANAS: Esperada[] = [
  { fichero: FAC, titulo: /title="Detalles de Factura"/, onClose: '() => setSelectedInvoice(null)', fuera: true },
  { fichero: FAC, titulo: /title="Registrar Nuevo Cliente"/, onClose: '() => setCreateCustomerModalOpen(false)', fuera: true, bloqueada: 'isSavingCustomer' },
  { fichero: FAC, titulo: /title="Confirmar Impresión"/, onClose: '() => setShowPrintConfirmModal(false)', fuera: true },
  { fichero: ECF, titulo: /title="Nueva Autorización SACF"/, onClose: 'onClose', fuera: true, bloqueada: 'loading' },
  { fichero: ECF, titulo: /title="Editar Secuencia SACF"/, onClose: 'onClose', fuera: true, bloqueada: 'loading' },
  { fichero: COT_EDIT, titulo: /title="Buscar Producto"/, onClose: '() => setProductSearchOpen(false)', fuera: false },
  { fichero: COT_EDIT, titulo: /title="Buscar Cliente"/, onClose: '() => setCustomerSearchOpen(false)', fuera: false },
  { fichero: CXC, titulo: /title="Registrar Recibo de Cobro"/, onClose: '() => setShowPaymentModal(false)', fuera: true, bloqueada: 'submitting' },
  { fichero: CXC, titulo: /title="Detalle de Recibo de Ingreso"/, onClose: '() => setShowReceiptDetailsModal(false)', fuera: true },
  { fichero: EDO, titulo: /title=\{<span[^]*?\{fila\.nombre\}/, onClose: 'onCerrar', fuera: true },
];
/** Las capas transparentes del desplegable de guardar, por fichero. */
const CAPAS: Record<string, number> = { [FAC]: 1, [COT_NEW]: 1, [COT_EDIT]: 1 };

/** Lo que pasa al confirmar: cada llamada, cuantas veces. Igual que en la base. */
const LLAMADAS_FISCALES: Record<string, RegExp[]> = {
  [FAC]: [/handleIssueInvoice\(fakeEvent, pendingPostAction\)/g, /onSubmit=\{handleCreateCustomerSubmit\}/g,
    //  Credito (34) y debito (33) por separado: juntas, cambiar una por la otra no se notaba (mutante).
    /handleCreateAdjustmentNote\(selectedInvoice, '34'\)/g, /handleCreateAdjustmentNote\(selectedInvoice, '33'\)/g, /handleResendEmail\(selectedInvoice\.id\)/g,
    /\/api\/v1\/invoices\/\$\{selectedInvoice\.id\}\/pdf/g, /handleNewCustomerSearchDGII/g],
  [ECF]: [/onSubmit=\{handleSubmit\}/g, /type="submit"/g],
  [CXC]: [/onClick=\{handleSubmitPayment\}/g, /handlePrintReceipt\(selectedReceipt\.id, \{ hideBalance: activeTab === 'receipts' \}\)/g],
  [COT_EDIT]: [/selectProduct\(p\)/g, /setCustomerId\(c\.id\); setCustomerName\(c\.name\); setCustomerSearchOpen\(false\);/g],
  [EDO]: [/onClick=\{imprimir\}/g, /fetch\(`\/api\/v1\/cartera\/\$\{fila\.id\}\?tipo=\$\{tipo\}`\)/g],
};

function main() {
  for (const f of [...CON_VENTANA, COT_NEW]) if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: no existe ${f}`);
  const todos = ficheros();
  const src = new Map(todos.map((f) => [f, sinComentarios(leer(f))]));
  for (const f of CON_VENTANA) if (!src.has(f)) src.set(f, sinComentarios(leer(f)));

  console.log('\n1) Ninguna ventana escrita a mano\n');
  const aMano: string[] = [];
  const capas: Record<string, number> = {};
  for (const [f, s] of src) for (const m of s.matchAll(VENTANA_A_MANO)) {
    if (esCapaTransparente(m[0])) { capas[f] = (capas[f] ?? 0) + 1; continue; }
    aMano.push(`${f.replace('src/', '')}@${linea(s, m.index!)}`);
  }
  ok(`en los ${src.size} ficheros del grupo, ningun fixed inset-0 de ventana`, aMano.length === 0, aMano.join(', '));
  //  Las capas del desplegable son ciertas antes y despues: van atadas a que ya no quede ventana a mano
  //  (si no, regalarian un OK en la contraprueba).
  ok('  y lo unico fixed inset-0 que queda son las capas transparentes del desplegable de guardar (las anotadas, ni una de mas)',
    aMano.length === 0 && Object.keys(CAPAS).every((f) => capas[f] === CAPAS[f]) && Object.keys(capas).every((f) => f in CAPAS),
    JSON.stringify(capas));

  console.log('\n2) La ventana de la casa: importada, usada y con titulo\n');
  const sinImport = CON_VENTANA.filter((f) => !/import \{ Modal \} from '@\/components\/ui\/dialog';/.test(src.get(f)!));
  const sinUso = CON_VENTANA.filter((f) => modales(src.get(f)!).length === 0);
  ok(`los ${CON_VENTANA.length} ficheros con ventana importan Modal de @/components/ui/dialog`, sinImport.length === 0, sinImport.join(', '));
  ok('  y lo usan', sinUso.length === 0, sinUso.join(', '));
  const total = CON_VENTANA.reduce((n, f) => n + modales(src.get(f)!).length, 0);
  ok(`  ${VENTANAS.length} ventanas, ni una mas ni una menos`, total === VENTANAS.length, `${total}`);
  const sinTitulo = CON_VENTANA.flatMap((f) => modales(src.get(f)!).filter((m) => !/\btitle=/.test(m.attrs)).map((m) => `${f}@${linea(src.get(f)!, m.inicio)}`));
  ok('  cada <Modal lleva title', total > 0 && sinTitulo.length === 0, sinTitulo.join(', '));

  console.log('\n3) Cada ventana hace lo que hacia la suya\n');
  for (const v of VENTANAS) {
    const ms = modales(src.get(v.fichero)!).filter((m) => v.titulo.test(m.attrs));
    const nombre = `${v.fichero.replace(/^src\/(app\/dashboard\/|components\/)/, '')} ${v.titulo.source.replace(/^title=["\\{]*/, '').replace(/"$/, '').slice(0, 30)}`;
    //  Sin la ventana, cada comprobacion de abajo da FALLA por si misma (no una sola por ventana).
    const hay = ms.length === 1;
    const a = hay ? ms[0].attrs : '';
    const onClose = /\bonClose=\{([^\n]*)\}\n/.exec(a)?.[1]?.trim();
    ok(`${nombre}: onClose = ${v.onClose}`, hay && onClose === v.onClose, hay ? (onClose ?? 'sin onClose') : `${ms.length} ventanas con ese titulo`);
    const noCierra = /\bcerrarAlPulsarFuera=\{false\}/.test(a);
    ok(`  ${v.fuera ? 'pulsar fuera CIERRA (sin cerrarAlPulsarFuera={false})' : 'pulsar fuera NO cierra (cerrarAlPulsarFuera={false})'}`,
      hay && (v.fuera ? !noCierra && !/cerrarAlPulsarFuera/.test(a) : noCierra));
    if (v.bloqueada) ok(`  bloqueada={${v.bloqueada}} mientras guarda`, hay && new RegExp(`\\bbloqueada=\\{${v.bloqueada}\\}`).test(a));
    else ok('  sin bloqueada (no guarda nada)', hay && !/\bbloqueada=/.test(a));
  }
  //  Las busquedas de la cotizacion: su X vieja (que cerraba) se va, porque la X es la de la ventana.
  const cot = src.get(COT_EDIT)!;
  ok('las busquedas de la cotizacion ya no llevan una X propia dentro (la de la ventana hace lo mismo)',
    modales(cot).length === 2 && !/<IconButton[^\n]*onClick=\{\(\) => set(Product|Customer)SearchOpen\(false\)\}/.test(cot));

  console.log('\n4) Restos\n');
  const sinUsar = CON_VENTANA.filter((f) => {
    const s = src.get(f)!;
    const imp = /import \{([^}]*)\} from 'framer-motion';/.exec(s)?.[1] ?? '';
    return imp.split(',').map((x) => x.trim()).filter(Boolean).some((n) => (s.match(new RegExp(`\\b${n}\\b`, 'g')) ?? []).length < 2);
  });
  ok('ningun AnimatePresence/motion importado sin uso', modales(src.get(FAC)!).length > 0 && sinUsar.length === 0, sinUsar.join(', '));
  const edo = src.get(EDO)!;
  ok('el estado de cuenta usa la ventana y deja su oyente de Escape propio (cerraba con otra encima)',
    modales(edo).length === 1 && !/addEventListener\('keydown'/.test(edo) && !/role="dialog"/.test(edo));

  console.log('\n5) Lo que pasa al confirmar no cambia (invariante)\n');
  const { huella, enCommit, diferencia } = require('./huellaDePantalla') as typeof import('./huellaDePantalla');
  for (const [f, res] of Object.entries(LLAMADAS_FISCALES)) {
    const antes = sinComentarios(enCommit(BASE, f)), ahora = src.get(f)!;
    const dist = res.filter((re) => (antes.match(re) ?? []).length !== (ahora.match(re) ?? []).length || (antes.match(re) ?? []).length === 0);
    invariante(`${f.replace(/^src\//, '')}: las mismas llamadas al confirmar, las mismas veces`, dist.length === 0, dist.map((r) => r.source).join(' | '));
  }

  console.log('\n6) Lo que se lee no cambia (invariante)\n');
  const NUEVOS = ['Buscar Producto', 'Buscar Cliente'];
  //  Un `title="..."` de un Modal es el texto que antes iba en su cabecera.
  const lectura = (s: string) => {
    const deModal = new Set(modales(s.replace(/\r\n/g, '\n')).map((m) => /\btitle="([^"]*)"/.exec(m.attrs)?.[1]).filter(Boolean) as string[]);
    return huella(s).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:'))
      .map((x) => (x.startsWith('title:') && deModal.has(x.slice(6)) ? `texto:${x.slice(6)}` : x))
      .filter((x) => !NUEVOS.includes(x.slice(6)));
  };
  let cambiados = 0;
  for (const f of [...new Set([...todos, ...CON_VENTANA])]) {
    let antes: string;
    try { antes = enCommit(BASE, f); } catch { continue; }
    //  Los DOS commits del lote (ver verificar_ui_ventas): el 260 cambia rotulos de e-CF a proposito.
    const d = diferencia(lectura(antes), lectura(enCommit(LOTE, f)));
    if (d.faltan.length || d.sobran.length) { cambiados++; console.log(`        ${f}: faltan ${JSON.stringify(d.faltan)} sobran ${JSON.stringify(d.sobran)}`); }
  }
  invariante(`textos, placeholder, title, avisos y la API iguales a ${BASE}`, cambiados === 0, `${cambiados} cambiados`);

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main();
