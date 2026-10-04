/**
 * Lote 273 -- Compras y Finanzas al estandar de UI (auditoria del 2026-10-03, `docs/estandar_ui.md`).
 *
 * El grupo: compras, pedidos a suplidor, suplidores, cuentas por pagar, retenciones, bancos, caja,
 * contabilidad, el panel financiero, los reportes (606, 607, conciliacion) y los componentes que
 * comparten (`components/financial`, `components/precios`, el autocompletado de suplidores).
 *
 * Lo que se comprueba (todo FALLA con los ficheros de `57f741d`, la base del lote):
 *  1. ningun boton escrito a mano con las clases de la casa, y los `<button>` que quedan son los
 *     anotados como excepcion, POR NOMBRE (pestañas, interruptores, filas de un desplegable...);
 *  2. todo boton de solo icono tiene `aria-label`;
 *  3. todo boton lleva `type` explicito;
 *  4. ningun pie con la principal antes que Cancelar (los tres que la auditoria encontro al reves,
 *     y la regla en general: un `type="submit"` no va delante de su Cancelar);
 *  5. las cabeceras usan `CabeceraDePagina` y no queda ningun `<h1>` escrito a mano (ni dorado);
 *  6. iconos del estandar: nada de `Edit`/`Edit2` (es `Pencil`).
 * Invariante: los TEXTOS visibles, `placeholder`, `title`, avisos y direcciones de la API de cada
 * fichero son los mismos que en la base (las clases y los `aria-label` cambian a proposito). El
 * titulo y la descripcion que pasan a ser props de `CabeceraDePagina` cuentan como texto.
 *
 * Se ejecuta con: npx tsx scratch/verificar_ui_compras_finanzas.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { diferencia, enCommit, huella } from './huellaDePantalla';

const raiz = join(__dirname, '..');
const BASE = '57f741d';
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

const RAICES = [
  'src/app/dashboard/purchases', 'src/app/dashboard/suppliers', 'src/app/dashboard/ap', 'src/app/dashboard/retentions',
  'src/app/dashboard/bank', 'src/app/dashboard/cash', 'src/app/dashboard/accounting', 'src/app/dashboard/financial',
  'src/app/dashboard/reports', 'src/components/financial', 'src/components/precios', 'src/components/ui/supplier-autocomplete.tsx',
];
function tsx(r: string): string[] {
  const p = join(raiz, r);
  if (statSync(p).isFile()) return [r];
  return readdirSync(p).sort().flatMap((n) => tsx(`${r}/${n}`)).filter((f) => f.endsWith('.tsx'));
}
const FICHEROS = RAICES.flatMap(tsx);
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

type Boton = { f: string; etiqueta: string; apertura: string; cuerpo: string; linea: number };
/** Todos los botones (`<button>`, `<Button>`, `<IconButton>`) con su apertura y su cuerpo. */
function botones(f: string, src: string): Boton[] {
  const s = sinComentarios(src);
  const out: Boton[] = [];
  const re = /<(button|Button|IconButton)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const apertura = s.slice(m.index, k + 1);
    if (apertura.endsWith('/>')) { out.push({ f, etiqueta: m[1], apertura, cuerpo: '', linea: s.slice(0, m.index).split('\n').length }); continue; }
    const cierre = s.indexOf(`</${m[1]}>`, k);
    out.push({ f, etiqueta: m[1], apertura, cuerpo: s.slice(k + 1, cierre < 0 ? k + 1 : cierre), linea: s.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * Los `<button>` que se quedan a proposito, por fichero y por lo que hacen (no por su linea):
 * no son acciones, o tienen una forma que el componente no tiene.
 */
const EXCEPCIONES: Record<string, { clave: string; por: string }[]> = {
  'src/app/dashboard/purchases/page.tsx': [
    { clave: 'role="switch"', por: 'interruptor de "Compra por Monto General"' },
    { clave: 'aria-label="Restar uno a la cantidad"', por: 'paso del contador de cantidad, pegado al campo' },
    { clave: 'aria-label="Sumar uno a la cantidad"', por: 'paso del contador de cantidad, pegado al campo' },
    { clave: 'onClick={() => irAPaso(dePaso)}', por: 'enlace "editar" del resumen' },
    { clave: 'onClick={() => irAPaso(p.n)}', por: 'el indicador de pasos' },
    { clave: "onClick={() => setActiveTab('historial')}", por: 'pestaña' },
    { clave: "setActiveTab('nuevo');", por: 'pestaña' },
    { clave: "onClick={() => setActiveTab('cheques')}", por: 'pestaña' },
  ],
  'src/app/dashboard/purchases/orders/page.tsx': [
    { clave: 'onClick={() => handleSelectProduct(p)}', por: 'fila del desplegable de productos' },
  ],
  'src/app/dashboard/ap/page.tsx': [
    { clave: "onClick={() => setActiveTab('bills')}", por: 'pestaña' },
    { clave: "onClick={() => setActiveTab('guarantees')}", por: 'pestaña' },
    { clave: "onClick={() => setActiveTab('history')}", por: 'pestaña' },
  ],
  'src/app/dashboard/retentions/page.tsx': [
    { clave: 'onClick={() => toggleActive(r)}', por: 'interruptor activo/inactivo' },
  ],
  'src/app/dashboard/cash/page.tsx': [
    { clave: 'onClick={() => caja.handleTabChange(tab.id)}', por: 'pestaña' },
  ],
  'src/app/dashboard/cash/components/ModalMovimiento.tsx': [
    { clave: 'onClick={() => c.setMoveType(t)}', por: 'selector Entrada/Salida' },
  ],
  'src/app/dashboard/cash/components/VistaApertura.tsx': [
    { clave: 'onClick={() => c.setShowNewRegisterModal(true)}', por: 'enlace "+ Nueva Terminal" junto a la etiqueta del campo' },
  ],
  'src/app/dashboard/cash/components/VistaArqueo.tsx': [
    { clave: 'onClick={() => { c.setDenomQty({}); }}', por: 'enlace "Limpiar Formulario"' },
  ],
  'src/app/dashboard/accounting/page.tsx': [
    { clave: 'onClick={() => setActiveTab(tab.id as any)}', por: 'pestaña' },
    { clave: "onClick={() => setActiveFinancialTab('income-statement')}", por: 'pestaña' },
    { clave: "onClick={() => setActiveFinancialTab('balance-sheet')}", por: 'pestaña' },
    { clave: 'onClick={() => handleTogglePeriodStatus(p.id, p.status)}', por: 'cerrar/reabrir periodo, con el color de su estado (movil y escritorio)' },
  ],
  'src/components/ui/supplier-autocomplete.tsx': [
    { clave: 'if (onClear) onClear();', por: 'la X dentro del campo' },
    { clave: 'onSelect(c);', por: 'fila del desplegable de suplidores' },
  ],
};

/** El texto visible de un cuerpo de boton: sin etiquetas, y de las expresiones solo sus literales. */
const textoDe = (cuerpo: string) =>
  cuerpo.replace(/<[^>]*>/g, ' ')
    //  De una expresion cuenta lo que es texto: sus literales, o un rotulo (`{tab.label}`).
    .replace(/\{[^{}]*\}/g, (x) => [...(x.match(/'[^']+'|"[^"]+"|`[^`]+`/g) ?? []), ...(x.match(/\.(?:label|titulo|nombre|name)\b/g) ?? [])].join(' '))
    .replace(/\s+/g, ' ').trim();

function main() {
  const fuentes = new Map(FICHEROS.map((f) => [f, leer(f)] as const));
  if (FICHEROS.length < 30) throw new Error(`Precondicion: el grupo tiene ${FICHEROS.length} ficheros .tsx (se esperaban 37)`);
  const todos = FICHEROS.flatMap((f) => botones(f, fuentes.get(f)!));

  console.log('\n1) Botones: el componente, no las clases a mano\n');
  const anotado = (b: Boton) => (EXCEPCIONES[b.f] ?? []).some((e) => b.apertura.includes(e.clave));
  const casa = todos.filter((b) => b.etiqueta === 'button' && !anotado(b) && (
    /bg-\[#003366\][^"`]*hover:bg-\[#002244\]/.test(b.apertura)
    || /bg-white text-slate-700 border border-slate-300 hover:bg-slate-50/.test(b.apertura)
    || /bg-\[#C5A059\] hover:bg-\[#b08c4a\] text-slate-950/i.test(b.apertura)));
  ok(`ningun <button> con las clases de la casa (primario, secundario, dorado), fuera de las excepciones`, casa.length === 0,
    casa.map((b) => `${b.f.split('/').slice(-2).join('/')}:${b.linea}`).slice(0, 6).join(', '));
  const sueltos = todos.filter((b) => b.etiqueta === 'button' && !(EXCEPCIONES[b.f] ?? []).some((e) => b.apertura.includes(e.clave)));
  ok(`los <button> que quedan son las excepciones anotadas, por nombre (${Object.values(EXCEPCIONES).flat().length} claves)`, sueltos.length === 0,
    `${sueltos.length} sin anotar: ${sueltos.map((b) => `${b.f.split('/').slice(-2).join('/')}:${b.linea}`).slice(0, 8).join(', ')}`);
  const usados = new Set(todos.filter((b) => b.etiqueta === 'button').flatMap((b) => (EXCEPCIONES[b.f] ?? []).filter((e) => b.apertura.includes(e.clave)).map((e) => b.f + e.clave)));
  const muertas = Object.entries(EXCEPCIONES).flatMap(([f, es]) => es.filter((e) => !usados.has(f + e.clave)).map((e) => `${f}: ${e.clave}`));
  ok('  y cada excepcion anotada existe (una lista que no se poda deja de decir nada)', muertas.length === 0, muertas.slice(0, 3).join(' | '));
  const componente = todos.filter((b) => b.etiqueta !== 'button').length;
  ok(`  el grupo usa el componente (${componente} Button/IconButton)`, componente >= 120, `${componente}`);

  console.log('\n2) Solo icono: con nombre\n');
  const sinNombre = todos.filter((b) => !textoDe(b.cuerpo) && !/aria-label=/.test(b.apertura));
  ok('todo boton de solo icono tiene aria-label', sinNombre.length === 0,
    sinNombre.map((b) => `${b.f.split('/').slice(-2).join('/')}:${b.linea}`).slice(0, 8).join(', '));

  console.log('\n3) type explicito\n');
  const sinTipo = todos.filter((b) => !/\btype=/.test(b.apertura) && !/\basChild\b/.test(b.apertura));
  ok('todo boton lleva type (submit solo el que envia)', sinTipo.length === 0,
    `${sinTipo.length}: ${sinTipo.map((b) => `${b.f.split('/').slice(-2).join('/')}:${b.linea}`).slice(0, 8).join(', ')}`);

  console.log('\n4) Pies: Cancelar primero, la principal la ultima\n');
  const pos = (f: string, re: RegExp) => { const m = re.exec(sinComentarios(fuentes.get(f)!)); return m ? m.index : -1; };
  const tasa = 'src/components/precios/TasaDelDolarEnLinea.tsx';
  const iCancT = pos(tasa, /onClick=\{\(\) => setEditando\(false\)\}/), iGuardT = pos(tasa, /type="submit"/);
  ok('la tasa del dolar: [Cancelar] [Guardar y aplicar precios]', iCancT > -1 && iGuardT > -1 && iCancT < iGuardT);
  const ped = 'src/app/dashboard/purchases/orders/page.tsx';
  const iCancP = pos(ped, /onClick=\{\(\) => handleCancelOrder\(/), iEnviar = pos(ped, /onClick=\{\(\) => handleSendOrder\(/), iRecibir = pos(ped, /onClick=\{\(\) => openReceiveModal\(activeOrder\)\}/);
  ok('el detalle del pedido: "Cancelar Pedido" antes de Enviar y de Registrar Recepcion', iCancP > -1 && iCancP < iEnviar && iCancP < iRecibir);
  const com = 'src/app/dashboard/purchases/page.tsx';
  const iCancC = pos(com, /onClick=\{cancelEdit\}/), iGuardC = pos(com, /onClick=\{saveExpense\}/);
  ok('la compra: [Cancelar Edicion] antes de [Guardar Compra / Gasto]', iCancC > -1 && iGuardC > -1 && iCancC < iGuardC);
  //  La regla en general: un Cancelar que llega poco DESPUES de un submit es un pie al reves.
  const alReves = todos.filter((b) => textoDe(b.cuerpo) === 'Cancelar').filter((b) => {
    const s = sinComentarios(fuentes.get(b.f)!).split('\n');
    const antes = s.slice(Math.max(0, b.linea - 16), b.linea - 1).join('\n');
    return /type="submit"/.test(antes);
  });
  ok('  y en todo el grupo ningun "Cancelar" va justo despues de un submit', alReves.length === 0,
    alReves.map((b) => `${b.f.split('/').slice(-2).join('/')}:${b.linea}`).join(', '));

  console.log('\n5) Cabeceras\n');
  const conH1 = FICHEROS.filter((f) => /<h1\b[^>]*className=/.test(sinComentarios(fuentes.get(f)!)));
  ok('ningun <h1> escrito a mano en el grupo (la cabecera es CabeceraDePagina)', conH1.length === 0, conH1.join(', '));
  const dorados = FICHEROS.filter((f) => /<h1\b[^>]*#c5a059/i.test(fuentes.get(f)!));
  ok('  ninguno dorado (2,4:1 sobre blanco)', dorados.length === 0, dorados.join(', '));
  const CABECERAS = ['purchases/page.tsx', 'purchases/orders/page.tsx', 'suppliers/page.tsx', 'ap/page.tsx', 'retentions/page.tsx',
    'bank/page.tsx', 'accounting/page.tsx', 'financial/page.tsx', 'financial/customers/page.tsx', 'financial/suppliers/page.tsx',
    'financial/accounts-receivable/page.tsx', 'financial/accounts-payable/page.tsx', 'reports/page.tsx', 'reports/606/page.tsx',
    'reports/607/page.tsx', 'reports/bank-reconciliation/page.tsx', 'cash/components/VistaGestion.tsx', 'cash/components/VistaArqueo.tsx',
    'cash/components/VistaHistorico.tsx'].map((x) => `src/app/dashboard/${x}`);
  const sinCab = CABECERAS.filter((f) => !(/import \{ CabeceraDePagina \} from '@\/components\/ui\/cabecera-de-pagina'/.test(fuentes.get(f)!) && /<CabeceraDePagina\b/.test(sinComentarios(fuentes.get(f)!))));
  ok(`las ${CABECERAS.length} cabeceras del grupo usan CabeceraDePagina (importada y usada)`, sinCab.length === 0, sinCab.join(', '));
  //  Con pestañas de registro, las pestañas van SOLAS en las acciones (lote 243).
  const conPest = FICHEROS.filter((f) => /<PestanasDeRegistro\b/.test(fuentes.get(f)!));
  const pestSolas = conPest.filter((f) => /acciones=\{\s*(?:\/\*[\s\S]*?\*\/\s*)?<PestanasDeRegistro\b[^]*?\/>\s*\}/.test(fuentes.get(f)!));
  ok(`  con pestañas de registro, las pestañas van solas en las acciones (${conPest.length} pantallas)`, conPest.length >= 4 && pestSolas.length === conPest.length,
    conPest.filter((f) => !pestSolas.includes(f)).join(', '));

  console.log('\n6) Iconos\n');
  const edit = FICHEROS.filter((f) => /import \{[^}]*\b(Edit|Edit2)\b[^}]*\} from 'lucide-react'/.test(fuentes.get(f)!));
  ok('editar es Pencil (ni Edit ni Edit2)', edit.length === 0, edit.join(', '));

  console.log('\n7) Lo que no cambia (invariante): textos, ejemplos, titulos, avisos y API\n');
  //  Las clases y los aria-label cambian a proposito. El titulo y la descripcion que pasan a props
  //  de la cabecera siguen siendo texto visible: se cuentan como texto.
  const visible = (src: string) => {
    const props = [...sinComentarios(src.replace(/\r\n/g, '\n')).matchAll(/\b(?:titulo|descripcion)="([^"]*)"/g)].map((m) => `texto:${m[1]}`);
    return [...huella(src).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:')), ...props].sort();
  };
  const distintos: string[] = [];
  for (const f of FICHEROS) {
    let antes = '';
    try { antes = enCommit(BASE, f); } catch { distintos.push(`${f}: no existe en ${BASE}`); continue; }
    const { faltan, sobran } = diferencia(visible(antes), visible(fuentes.get(f)!));
    if (faltan.length || sobran.length) distintos.push(`${f.split('/').slice(-2).join('/')}: faltan ${JSON.stringify(faltan.slice(0, 2))} sobran ${JSON.stringify(sobran.slice(0, 2))}`);
  }
  invariante(`los ${FICHEROS.length} ficheros dicen lo mismo que en ${BASE}`, distintos.length === 0, distintos.slice(0, 4).join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

try { main(); } catch (e) { console.error(e); process.exit(2); }
