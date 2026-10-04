/**
 * Lote 279 -- las ventanas escritas a mano de Compras y Finanzas, a la ventana comun (`Modal`,
 * `src/components/ui/dialog.tsx`, lote 276).
 *
 * El grupo: compras (OCR, alta rapida de proveedor, detalle de la compra), pedidos a suplidor
 * (detalle y recepcion), cuentas por pagar (el pago a suplidor), retenciones (eliminar), bancos
 * (registrar movimiento), contabilidad (cuenta, periodo, asiento) y caja (nueva terminal,
 * movimiento, cierre y ver sesion): QUINCE ventanas.
 *
 * Lo que se comprueba (todo FALLA con los ficheros de la base, `origin/lote-276-ventana-comun`):
 *  1. en el grupo no queda ningun `fixed inset-0` (ni una ventana escrita a mano); no hay
 *     excepciones;
 *  2. cada fichero importa `Modal` de `@/components/ui/dialog` Y lo usa (por separado);
 *  3. por ventana: la misma variable la abre, el mismo manejador la cierra (`onClose` igual a lo que
 *     hacia su X o su Cancelar), lleva `title`, `cerrarAlPulsarFuera={false}` SOLO en las que antes
 *     no cerraban al pulsar el fondo, `bloqueada` con su estado de guardando, y `capa` en la que se
 *     abre encima de otra;
 *  4. (invariante, cierto tambien en la base) no quedan `AnimatePresence` / `motion` / `m` /
 *     `LazyMotion` importados sin uso;
 *  5. tres ventanas de caja se DIBUJAN (la de la nueva terminal no: `useRouter` exige el enrutador) (react-dom/server): salen como `role="dialog"` con su
 *     titulo, y el cierre (arqueo ciego, lote 172) sigue ensenando el resultado solo al cerrar.
 * Invariante (salida 3): textos, `placeholder`, `title`, avisos y direcciones de la API iguales a
 * la base. El `title`/`description` que pasan a props del `Modal` cuentan como TEXTO. Cambios
 * anotados, por nombre: el titulo nuevo del OCR y el "Cerrar Ventana" del detalle de la compra
 * (pasa a ser la X de la ventana; "Cerrar Detalle" sigue en el pie).
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ventanas_compras_finanzas.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { diferencia, enCommit, huella } from './huellaDePantalla';

const raiz = join(__dirname, '..');
const BASE = 'ab9e5fd' /* lote 276: commit fijo, la rama se borro al fusionar */;
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

const RAICES = ['purchases', 'suppliers', 'ap', 'retentions', 'bank', 'cash', 'accounting', 'financial', 'reports'].map((x) => `src/app/dashboard/${x}`);
function tsx(r: string): string[] {
  const p = join(raiz, r);
  if (statSync(p).isFile()) return [r];
  return readdirSync(p).sort().flatMap((n) => tsx(`${r}/${n}`)).filter((f) => f.endsWith('.tsx'));
}
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const D = 'src/app/dashboard/';

/** Las aperturas `<Modal ...>` del fichero (con llaves anidadas: un `icono={<X />}` lleva un `>`). */
function modales(src: string): string[] {
  const s = sinComentarios(src);
  const out: string[] = [];
  for (const m of s.matchAll(/<Modal\b/g)) {
    let k = m.index! + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    out.push(s.slice(m.index!, k + 1).replace(/\s+/g, ' '));
  }
  return out;
}
/** El valor de una prop `{...}` o `"..."` de una apertura, o null. */
function prop(apertura: string, nombre: string): string | null {
  const re = new RegExp(`\\s${nombre}=(\\{|")`);
  const m = re.exec(apertura);
  if (!m) return /\s/.test(apertura) && new RegExp(`\\s${nombre}(?=[\\s>])`).test(apertura) ? 'true' : null;
  let i = m.index + m[0].length;
  if (m[1] === '"') return apertura.slice(i, apertura.indexOf('"', i));
  let d = 1; const ini = i;
  for (; i < apertura.length && d; i++) { if (apertura[i] === '{') d++; else if (apertura[i] === '}') d--; }
  return apertura.slice(ini, i - 1).trim();
}

type Ventana = {
  f: string; nombre: string; isOpen: string; onClose: string; fuera: boolean;
  bloqueada?: string; capa?: string; titulo: string;
};
/**
 * Cada ventana con lo que hacia la vieja: `fuera` es si su fondo cerraba al pulsarlo (en la base,
 * un `onClick` en el fondo: ap, retenciones y las tres de contabilidad; las demas, no).
 */
const VENTANAS: Ventana[] = [
  { f: 'purchases/page.tsx', nombre: 'OCR', isOpen: 'showOcrModal', onClose: '() => setShowOcrModal(false)', fuera: false, titulo: '"Lector OCR (Subir Factura)"' },
  { f: 'purchases/page.tsx', nombre: 'alta de proveedor', isOpen: 'showAddSupplierModal', onClose: '() => setShowAddSupplierModal(false)', fuera: false, bloqueada: 'isSavingSupplier', titulo: '"Agregar Nuevo Proveedor"' },
  { f: 'purchases/page.tsx', nombre: 'detalle de la compra', isOpen: '!!selectedExpense', onClose: '() => setSelectedExpense(null)', fuera: false, titulo: '"Detalle de la Transacción"' },
  { f: 'purchases/orders/page.tsx', nombre: 'detalle del pedido', isOpen: 'showDetailModal && !!activeOrder', onClose: '() => setShowDetailModal(false)', fuera: false, titulo: 'activeOrder &&' },
  { f: 'purchases/orders/page.tsx', nombre: 'recepcion del pedido', isOpen: 'showReceiveModal && !!activeOrder', onClose: '() => setShowReceiveModal(false)', fuera: false, bloqueada: 'submitting', capa: '60', titulo: 'activeOrder && <>Registrar Recepción - {activeOrder.orderNumber}</>' },
  { f: 'ap/page.tsx', nombre: 'pago a suplidor', isOpen: 'showPaymentModal && !!selectedSupplier && !!selectedBill', onClose: '() => setShowPaymentModal(false)', fuera: true, bloqueada: 'submitting', titulo: '"Registrar Pago Contable"' },
  { f: 'retentions/page.tsx', nombre: 'eliminar retencion', isOpen: '!!deleteTarget', onClose: '() => setDeleteTarget(null)', fuera: true, titulo: '"Eliminar retención"' },
  { f: 'bank/page.tsx', nombre: 'movimiento bancario', isOpen: 'showTxModal && !!selectedAccount', onClose: '() => setShowTxModal(false)', fuera: false, bloqueada: 'submitting', titulo: '"Registrar Movimiento"' },
  { f: 'accounting/page.tsx', nombre: 'nueva cuenta', isOpen: 'showAccountModal', onClose: '() => setShowAccountModal(false)', fuera: true, bloqueada: 'submitting', titulo: '"Nueva Cuenta Contable"' },
  { f: 'accounting/page.tsx', nombre: 'abrir periodo', isOpen: 'showPeriodModal', onClose: '() => setShowPeriodModal(false)', fuera: true, bloqueada: 'periodSubmitting', titulo: '"Abrir Período Contable"' },
  { f: 'accounting/page.tsx', nombre: 'nuevo asiento', isOpen: 'showJournalModal', onClose: '() => setShowJournalModal(false)', fuera: true, bloqueada: 'submitting', capa: '60', titulo: '"Nuevo Asiento Contable"' },
  { f: 'cash/components/VistaApertura.tsx', nombre: 'nueva terminal', isOpen: 'c.showNewRegisterModal', onClose: '() => c.setShowNewRegisterModal(false)', fuera: false, bloqueada: 'c.creatingRegister', titulo: '"Nueva Terminal de Caja"' },
  { f: 'cash/components/ModalMovimiento.tsx', nombre: 'movimiento de caja', isOpen: 'c.showMoveModal', onClose: '() => c.setShowMoveModal(false)', fuera: false, bloqueada: 'c.submitting', titulo: "c.moveType === 'cash_in' ? 'Entrada de Efectivo' : 'Salida de Efectivo'" },
  //  El cierre no tenia X ni fondo que cerrara: su unica salida era "Volver al Inicio".
  { f: 'cash/components/ModalCierre.tsx', nombre: 'cierre de caja', isOpen: 'c.showSuccessModal', onClose: 'c.handleSuccessClose', fuera: false, titulo: '"Cierre Exitoso"' },
  { f: 'cash/components/ModalVerSesion.tsx', nombre: 'ver sesion', isOpen: 'h.showViewModal && !!h.selectedSession', onClose: '() => h.setShowViewModal(false)', fuera: false, titulo: '"Detalle de Turno"' },
];
const FICHEROS = [...new Set(VENTANAS.map((v) => D + v.f))];

/** Lo visible: la huella sin clases ni aria-label, y el title/description del Modal como TEXTO. */
function visible(src: string): string[] {
  let s = src.replace(/\r\n/g, '\n');
  //  Dentro de cada apertura `<Modal`, `title="X"` es el titulo de la ventana: texto, no un globo.
  s = s.replace(/<Modal\b[\s\S]*?\n\s*>/g, (ap) => ap.replace(/\btitle="([^"]*)"/g, 'titulo="$1"').replace(/\bdescription="([^"]*)"/g, 'descripcion="$1"'));
  const props = [...sinComentarios(s).matchAll(/\b(?:titulo|descripcion)="([^"]*)"/g)].map((m) => `texto:${m[1]}`);
  return [...huella(s).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:')), ...props].sort();
}
/** Cambios de texto hechos a proposito, por fichero. */
const ANOTADOS: Record<string, { sobran: string[]; faltan: string[] }> = {
  'src/app/dashboard/purchases/page.tsx': {
    sobran: ['texto:Lector OCR (Subir Factura)'], // el OCR no tenia titulo: el del boton que lo abre
    faltan: ['texto:Cerrar Ventana'], // pasa a ser la X de la ventana (aria-label "Cerrar")
  },
};

async function main() {
  const fuentes = new Map(FICHEROS.map((f) => [f, leer(f)] as const));
  //  Precondicion, cierta en los dos estados: los ficheros del grupo existen y nombran sus ventanas.
  for (const v of VENTANAS) {
    const src = fuentes.get(D + v.f)!;
    const clave = v.isOpen.replace(/^!!/, '').split(' && ')[0];
    if (!src.includes(clave)) throw new Error(`Precondicion: ${v.f} no nombra ${clave}`);
  }

  console.log('\n1) Ninguna ventana escrita a mano en el grupo\n');
  const grupo = RAICES.flatMap(tsx);
  const aMano = grupo.flatMap((f) => [...sinComentarios(leer(f)).matchAll(/fixed inset-0/g)].map((m) => `${f.replace(D, '')}:${leer(f).slice(0, m.index).split('\n').length}`));
  ok(`ningun "fixed inset-0" en los ${grupo.length} ficheros .tsx del grupo (sin excepciones)`, aMano.length === 0, aMano.slice(0, 6).join(', '));

  console.log('\n2) Modal importado y usado\n');
  for (const f of FICHEROS) {
    const s = sinComentarios(fuentes.get(f)!);
    const importa = /import \{ Modal \} from '@\/components\/ui\/dialog';/.test(s);
    const usa = /<Modal\b/.test(s);
    ok(`${f.replace(D, '')}: importa Modal y lo usa`, importa && usa, `import ${importa}, uso ${usa}`);
  }
  const total = FICHEROS.reduce((n, f) => n + modales(fuentes.get(f)!).length, 0);
  ok(`quince ventanas pasadas a Modal en el grupo (${total})`, total === VENTANAS.length);

  console.log('\n3) Cada ventana: abre, cierra y se comporta como la vieja\n');
  for (const v of VENTANAS) {
    const ap = modales(fuentes.get(D + v.f)!).find((a) => prop(a, 'isOpen') === v.isOpen);
    if (!ap) { ok(`${v.nombre}: un <Modal isOpen={${v.isOpen}}>`, false, 'no esta'); continue; }
    const quejas: string[] = [];
    if (prop(ap, 'onClose') !== v.onClose) quejas.push(`onClose=${prop(ap, 'onClose')}`);
    const titulo = prop(ap, 'title');
    if (!titulo || !(titulo === v.titulo.replace(/^"|"$/g, '') || titulo.startsWith(v.titulo))) quejas.push(`title=${titulo}`);
    const fuera = prop(ap, 'cerrarAlPulsarFuera');
    if (v.fuera ? fuera !== null : fuera !== 'false') quejas.push(`cerrarAlPulsarFuera=${fuera}`);
    if ((prop(ap, 'bloqueada') ?? undefined) !== v.bloqueada) quejas.push(`bloqueada=${prop(ap, 'bloqueada')}`);
    if ((prop(ap, 'capa') ?? undefined) !== v.capa) quejas.push(`capa=${prop(ap, 'capa')}`);
    ok(`${v.nombre}: onClose, titulo, ${v.fuera ? 'cierra' : 'NO cierra'} al pulsar fuera${v.bloqueada ? `, bloqueada={${v.bloqueada}}` : ''}${v.capa ? `, capa ${v.capa}` : ''}`,
      quejas.length === 0, quejas.join(' | '));
  }

  console.log('\n4) Nada de animacion importada sin uso\n');
  const sobrantes = FICHEROS.flatMap((f) => {
    const s = sinComentarios(fuentes.get(f)!);
    const imp = /import \{([^}]*)\} from 'framer-motion'/.exec(s)?.[1].split(',').map((x) => x.trim()).filter(Boolean) ?? [];
    const cuerpo = s.replace(/import \{[^}]*\} from 'framer-motion';?/, '');
    return imp.filter((n) => !new RegExp(n === 'domAnimation' ? '\\bdomAnimation\\b' : `<${n}[\\s.>]`).test(cuerpo)).map((n) => `${f.replace(D, '')}: ${n}`);
  });
  //  Cierto antes y despues (la base tambien usaba lo que importaba): invariante, no `ok()`.
  invariante('ningun AnimatePresence / motion / m / LazyMotion importado sin uso', sobrantes.length === 0, sobrantes.join(', '));

  console.log('\n5) Las ventanas de caja, dibujadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  type Fn = (p: object) => unknown;
  const cargar = async (n: string): Promise<Fn | null> => {
    try { return ((await import(`../src/app/dashboard/cash/components/${n}`)) as Record<string, Fn>)[n] ?? null; } catch { return null; }
  };
  const nada = () => {};
  const pintar = async (n: string, props: object) => {
    const C = await cargar(n);
    if (!C) return '';
    try { return renderToStaticMarkup(React.createElement(C as never, props)); } catch (e) { return `LANZO ${(e as Error).message}`; }
  };
  const dialogo = (html: string, titulo: string) => /role="dialog"/.test(html) && /aria-modal="true"/.test(html)
    && new RegExp(`<h2 id="[^"]*-titulo"[^>]*>[\\s\\S]*?${titulo}`).test(html);
  const cierre = await pintar('ModalCierre', { c: { showSuccessModal: true, handleSuccessClose: nada, closedSessionId: 's1',
    resultadoArqueo: { expectedBalance: '1000', actualBalance: '990', difference: '-10', totalTransferencias: '0' } } });
  ok('el cierre: una ventana con su titulo "Cierre Exitoso"', dialogo(cierre, 'Cierre Exitoso'));
  ok('  y el resultado del arqueo sale AL CERRAR (esperado, contado, diferencia pendiente de aprobar)',
    dialogo(cierre, 'Cierre Exitoso') && /Esperado en sistema/.test(cierre) && /pendiente de aprobación/.test(cierre) && /Volver al Inicio/.test(cierre));
  const mov = await pintar('ModalMovimiento', { c: { showMoveModal: true, moveType: 'cash_out', moveAmount: '', moveDescription: '', submitting: false,
    setShowMoveModal: nada, setMoveType: nada, setMoveAmount: nada, setMoveDescription: nada, handleAddMovement: nada } });
  ok('el movimiento de caja: una ventana titulada segun el tipo ("Salida de Efectivo")', dialogo(mov, 'Salida de Efectivo'));
  const ver = await pintar('ModalVerSesion', { h: { showViewModal: true, setShowViewModal: nada, selectedSession: { id: 's1', registerName: 'Caja 7',
    createdAt: '2026-09-20T14:00:00Z', closedAt: null, userId: 'u', status: 'closed', initialBalance: '0', expectedBalance: '0', actualBalance: '0', difference: '0' } } });
  ok('ver sesion: una ventana "Detalle de Turno" con la terminal en la descripcion', dialogo(ver, 'Detalle de Turno') && /-descripcion"[^>]*>Caja 7</.test(ver));
  //  `VistaApertura` no se dibuja: usa `useRouter`, que fuera del enrutador de Next lanza. Su
  //  ventana la cubren las comprobaciones de la seccion 3.

  console.log('\n6) Lo que no cambia (invariante): textos, ejemplos, titulos, avisos y API\n');
  const distintos: string[] = [];
  const noVistos: string[] = [];
  for (const f of FICHEROS) {
    let antes = '';
    try { antes = enCommit(BASE, f); } catch { distintos.push(`${f}: no existe en ${BASE}`); continue; }
    let { faltan, sobran } = diferencia(visible(antes), visible(fuentes.get(f)!));
    const a = ANOTADOS[f];
    if (a) {
      //  Lo anotado se descuenta si esta; si no esta, no rompe el invariante (en la base no esta), pero
      //  lo dice la comprobacion de abajo: una anotacion que no se ve no dice nada.
      const quita = (xs: string[], ys: string[]) => { const r = [...xs]; for (const y of ys) { const i = r.indexOf(y); if (i >= 0) r.splice(i, 1); else noVistos.push(y); } return r; };
      faltan = quita(faltan, a.faltan); sobran = quita(sobran, a.sobran);
    }
    if (faltan.length || sobran.length) distintos.push(`${f.replace(D, '')}: faltan ${JSON.stringify(faltan.slice(0, 3))} sobran ${JSON.stringify(sobran.slice(0, 3))}`);
  }
  invariante(`los ${FICHEROS.length} ficheros dicen lo mismo que en ${BASE} (salvo lo anotado)`, distintos.length === 0, distintos.slice(0, 4).join(' | '));
  ok('  y los dos cambios de texto anotados (titulo del OCR, "Cerrar Ventana" pasa a la X) son los que hay', noVistos.length === 0, noVistos.join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
