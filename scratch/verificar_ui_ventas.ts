/**
 * Lote 272 -- el grupo VENTAS al estandar de UI (auditoria de UI del 2026-10-03, `docs/estandar_ui.md`).
 *
 * Pantallas: facturas (lista, detalle y su aviso de precios), cotizaciones (lista, alta y edicion),
 * clientes (lista y ficha), cuentas por cobrar (y su reporte), antiguedad de saldos, la central e-CF,
 * la cartera (`components/cartera`) y tres piezas que usan: el selector de cliente, el de retenciones
 * y el lector de facturas por foto.
 *
 * Lo que vigila:
 *   1. Ningun boton de accion escrito a mano con los colores de un boton (azul marino, dorado, rosa,
 *      gris...). Las UNICAS excepciones son los botones PARTIDOS (accion + desplegable: `rounded-l-lg`
 *      y `rounded-r-lg`), que el estandar deja como estan: emitir factura y guardar cotizacion (alta y
 *      edicion). Se nombran por fichero y se cuentan: un partido de mas tampoco pasa.
 *   2. Todo boton de solo icono lleva `aria-label`.
 *   3. Ningun pie con algo ANTES de Cancelar/Cerrar (la principal, la ultima).
 *   4. Las cabeceras pasan a `CabeceraDePagina` (import y uso por separado) y ningun `<h1>` es dorado.
 *   5. Todo boton con `onClick` dice su `type` (dentro de un `<form>`, sin type, envia el formulario).
 *   6. Iconos del estandar: nada de `Edit`/`Edit2` (es `Pencil`).
 *   INVARIANTE: los textos visibles, `placeholder`, `title`, avisos y direcciones de la API de cada
 *   fichero son los de `origin/lote-270-estandar-de-botones` (las clases cambian a proposito; los
 *   `aria-label` son nuevos). Lo que pasa de texto entre etiquetas a `titulo="..."` o
 *   `descripcion="..."` de la cabecera cuenta como el mismo texto.
 *
 * Se ejecuta con: npx tsx scratch/verificar_ui_ventas.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

const raiz = resolve(__dirname, '..');
//  Commit fijo y no la rama: la rama se borra al fusionar (lote 260/282), y un banco que nombra una rama
//  borrada revienta en cuanto alguien hace `git fetch --prune` o clona de cero.
const BASE = '57f741d'; // lote 270, la base del 272
const LOTE = '87d0e73'; // lote 272
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

const DIRS = [
  'src/app/dashboard/invoices', 'src/app/dashboard/quotes', 'src/app/dashboard/customers',
  'src/app/dashboard/receivables', 'src/app/dashboard/receivables-report', 'src/app/dashboard/antiguedad-saldos',
  'src/app/dashboard/ecf', 'src/components/cartera',
];
const SUELTOS = ['src/components/InvoiceImageUploader.tsx', 'src/components/RetentionSelector.tsx', 'src/components/ui/customer-autocomplete.tsx'];

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
  return [...out, ...SUELTOS];
}
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
//  Los comentarios se vacian conservando sus saltos de linea: asi las lineas que se citan son las del fichero.
const blanco = (x: string) => x.replace(/[^\n]/g, ' ');
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blanco).replace(/\/\*[\s\S]*?\*\//g, blanco)
  .replace(/(^|[^:])(\/\/[^\n]*)/g, (_x, a: string, b: string) => a + blanco(b));

type Boton = { etiqueta: string; attrs: string; cuerpo: string; inicio: number };
/** Cada `<button>`, `<Button>` e `<IconButton>` con sus atributos (respetando las llaves) y su cuerpo. */
function botones(s: string): Boton[] {
  const out: Boton[] = [];
  const re = /<(button|Button|IconButton)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const attrs = s.slice(m.index, k);
    const autocierre = attrs.endsWith('/');
    const fin = autocierre ? k : s.indexOf(`</${m[1]}>`, k);
    out.push({ etiqueta: m[1], attrs, cuerpo: autocierre ? '' : s.slice(k + 1, fin < 0 ? undefined : fin), inicio: m.index });
  }
  return out;
}
/** El texto visible del cuerpo: sin etiquetas, y de las expresiones solo sus cadenas. */
//  Texto JSX (entre `>` y `<`, fuera de llaves) o cadenas entre comillas dentro de una expresion
//  (`{printing ? 'Generando...' : 'Imprimir'}`). Un `{abierto ? <ChevronUp /> : <ChevronDown />}` no es texto.
const textoDe = (cuerpo: string) => {
  const c = `>${cuerpo}<`;
  const jsx = [...c.matchAll(/>([^<>{}]*)(?=[<{])/g)].map((m) => m[1]).join(' ');
  const cadenas = [...c.matchAll(/\{[^{}]*\}/g)].flatMap((m) => m[0].match(/'[^']*[A-Za-z][^']*'|"[^"]*[A-Za-z][^"]*"/g) ?? []).join(' ');
  //  Y una expresion sin etiquetas dentro (`{customer.customerName}`) pinta texto.
  const expr = [...c.matchAll(/\{([^{}<]*)\}/g)].filter((m) => /[A-Za-z]/.test(m[1])).length ? 'expresion' : '';
  return `${jsx} ${cadenas} ${expr}`.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ.]+/g, ' ').trim();
};
const esPartido = (b: Boton) => /rounded-l-lg|rounded-r-lg/.test(b.attrs);

/** Los partidos que el estandar deja como estan, por fichero. */
const PARTIDOS: Record<string, number> = {
  'src/app/dashboard/invoices/page.tsx': 2,
  'src/app/dashboard/quotes/new/page.tsx': 2,
  'src/app/dashboard/quotes/[id]/edit/page.tsx': 2,
};
const CON_CABECERA = [
  'src/app/dashboard/invoices/page.tsx', 'src/app/dashboard/quotes/page.tsx', 'src/app/dashboard/quotes/new/page.tsx',
  'src/app/dashboard/customers/page.tsx', 'src/app/dashboard/receivables/page.tsx', 'src/app/dashboard/receivables-report/page.tsx',
  'src/app/dashboard/antiguedad-saldos/page.tsx', 'src/app/dashboard/ecf/page.tsx',
];
/**
 * Colores de fondo de un boton de accion escrito a mano. El final es `(?![\w/-])` y no `\b`: tras un
 * valor entre corchetes (`bg-[#003366] `) no hay frontera de palabra, y un mutante con el azul a mano
 * sobrevivio asi. Tampoco cuenta `bg-primary/5` (un tinte, no un boton).
 */
const FONDO_DE_BOTON = /\bbg-(\[#003366\]|\[#c5a059\]|primary|secondary|rose-500|red-600|slate-500|slate-600|amber-500|amber-600|neutral-900|indigo-50)(?![\w/-])|bg-white text-slate-700 border|bg-slate-200 text-\[#003366\]|bg-slate-100 hover:bg-slate-200/i;

function main() {
  const todos = ficheros();
  for (const f of [...CON_CABECERA, ...Object.keys(PARTIDOS)]) if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: no existe ${f}`);
  const src = new Map(todos.map((f) => [f, sinComentarios(leer(f))]));

  console.log('\n1) Ningun boton de accion escrito a mano\n');
  const aMano: string[] = [];
  const partidos: Record<string, number> = {};
  for (const [f, s] of src) for (const b of botones(s)) {
    if (b.etiqueta !== 'button') continue;
    if (esPartido(b)) { partidos[f] = (partidos[f] ?? 0) + 1; continue; }
    //  Las pestanas, los conmutadores y la barra de pasos de la factura (aria-pressed, role="tab",
    //  aria-current) no son acciones: el estandar no los convierte.
    if (/\baria-pressed=|role="tab"|\baria-current=/.test(b.attrs)) continue;
    if (FONDO_DE_BOTON.test(b.attrs)) aMano.push(`${f.replace('src/', '')}@${s.slice(0, b.inicio).split('\n').length}`);
  }
  ok(`en los ${todos.length} ficheros, ningun <button> con fondo de boton de accion`, aMano.length === 0, aMano.slice(0, 6).join(', '));
  ok('  los unicos a mano son los partidos anotados (emitir factura, guardar cotizacion), ni uno de mas',
    Object.keys(PARTIDOS).every((f) => partidos[f] === PARTIDOS[f]) && Object.keys(partidos).every((f) => f in PARTIDOS)
    //  y el lado de solo icono de cada partido (el desplegable) dice que es
    && [...src.values()].every((s) => botones(s).filter(esPartido).every((b) => textoDe(b.cuerpo) !== '' || /\baria-label=/.test(b.attrs))),
    JSON.stringify(partidos));
  const usaBoton = todos.filter((f) => /<(Button|IconButton)\b/.test(src.get(f)!) && !/from '@\/components\/ui\/button'/.test(src.get(f)!));
  //  Cierto tambien antes del lote (la contraprueba lo dejo en OK): va de invariante, no regala un OK.
  invariante('  y todo fichero que usa Button/IconButton lo importa', usaBoton.length === 0, usaBoton.join(', '));

  console.log('\n2) Solo icono: con nombre\n');
  const sinNombre: string[] = [];
  for (const [f, s] of src) for (const b of botones(s)) {
    if (textoDe(b.cuerpo)) continue;
    if (!/\baria-label=/.test(b.attrs)) sinNombre.push(`${f.replace('src/', '')}@${s.slice(0, b.inicio).split('\n').length}`);
  }
  ok('todo boton de solo icono lleva aria-label', sinNombre.length === 0, `${sinNombre.length}: ${sinNombre.slice(0, 6).join(', ')}`);
  const iconos = [...src.values()].reduce((n, s) => n + botones(s).filter((b) => b.etiqueta === 'IconButton').length, 0);
  ok('  y van en IconButton (al menos 40 en el grupo)', iconos >= 40, `${iconos}`);

  console.log('\n3) Los pies: Cancelar primero, la principal la ultima\n');
  const alReves: string[] = [];
  for (const [f, s] of src) for (const b of botones(s)) {
    if (!/^(Cancelar|Cerrar)$/.test(textoDe(b.cuerpo))) continue;
    //  Lote 278: el pie de una ventana de la casa va en `footer={<>...</>}`, sin `<div>` propio; la caja
    //  empieza en lo que este mas cerca, el `<div` o el `footer={`.
    const caja = s.slice(Math.max(s.lastIndexOf('<div', b.inicio), s.lastIndexOf('footer={', b.inicio)), b.inicio);
    if (/<(button|Button|IconButton|a)\b/.test(caja)) alReves.push(`${f.replace('src/', '')}@${s.slice(0, b.inicio).split('\n').length}`);
  }
  ok('ningun pie con un boton ANTES de Cancelar/Cerrar', alReves.length === 0, alReves.join(', '));
  const aviso = src.get('src/app/dashboard/invoices/components/AvisoPreciosDelBorrador.tsx')!;
  ok('  el aviso de precios del borrador: "Dejar" primero, "Actualizar precios" (la principal) el ultimo',
    aviso.indexOf('Dejar los del borrador') > -1 && aviso.indexOf('Dejar los del borrador') < aviso.indexOf('Actualizar precios'));
  const modal = src.get('src/components/cartera/ModalEstadoCuenta.tsx')!;
  ok('  el estado de cuenta: imprimir es "documento" y va despues de Cerrar',
    /<Button[^>]*variant="documento"[^>]*onClick=\{imprimir\}/.test(modal) && modal.lastIndexOf('Cerrar') < modal.indexOf('onClick={imprimir}'));

  console.log('\n4) Cabeceras\n');
  const sinImport = CON_CABECERA.filter((f) => !/import \{ CabeceraDePagina \} from '@\/components\/ui\/cabecera-de-pagina';/.test(src.get(f)!));
  const sinUso = CON_CABECERA.filter((f) => !/<CabeceraDePagina\b[\s\S]*?\btitulo=/.test(src.get(f)!));
  ok(`las ${CON_CABECERA.length} cabeceras importan CabeceraDePagina`, sinImport.length === 0, sinImport.map((f) => f.replace('src/app/dashboard/', '')).join(', '));
  ok('  y la usan con su titulo', sinUso.length === 0, sinUso.map((f) => f.replace('src/app/dashboard/', '')).join(', '));
  const conH1 = CON_CABECERA.filter((f) => /<h1\b/.test(src.get(f)!));
  ok('  sin un <h1> propio al lado (el titulo es el de la cabecera)', conH1.length === 0, conH1.join(', '));
  const dorados = todos.filter((f) => [...src.get(f)!.matchAll(/<h1\b[^>]*>/g)].some((m) => /#c5a059|amber-500|text-secondary|text-\[#C5A059\]/i.test(m[0])));
  ok('ningun <h1> del grupo es dorado (2,4:1)', dorados.length === 0, dorados.join(', '));
  const ficha = src.get('src/app/dashboard/customers/[id]/page.tsx')!;
  ok('  la ficha del cliente: el nombre en blanco sobre su tarjeta azul marino (azul sobre azul no se leia)',
    /<h1 className="[^"]*text-white[^"]*">\{data\.customer\.name\}/.test(ficha));

  console.log('\n5) type explicito\n');
  const sinType: string[] = [];
  for (const [f, s] of src) for (const b of botones(s)) {
    if (/\bonClick=/.test(b.attrs) && !/\btype=/.test(b.attrs) && !/\basChild\b/.test(b.attrs)) sinType.push(`${f.replace('src/', '')}@${s.slice(0, b.inicio).split('\n').length}`);
  }
  ok('todo boton con onClick dice su type', sinType.length === 0, `${sinType.length}: ${sinType.slice(0, 20).join(', ')}`);

  console.log('\n6) Iconos\n');
  const conEdit = todos.filter((f) => /import \{[^}]*\b(Edit|Edit2)\b[^}]*\} from 'lucide-react'/.test(src.get(f)!));
  ok('nada de Edit/Edit2: editar es Pencil', conEdit.length === 0, conEdit.join(', '));
  ok('  clientes edita con Pencil', /<Pencil \/>/.test(src.get('src/app/dashboard/customers/page.tsx')!));

  console.log('\n7) Lo que se lee no cambia (invariante)\n');
  //  La huella: textos, placeholder, title, avisos y direcciones de la API. Sin clases ni aria-label.
  const { huella, enCommit, diferencia } = require('./huellaDePantalla') as typeof import('./huellaDePantalla');
  //  Lote 278: el `title="..."` de una ventana de la casa (`<Modal`) es el texto que antes iba en su
  //  cabecera, y cuenta como el mismo texto. Las dos busquedas de la cotizacion no tenian cabecera: sus
  //  titulos son NUEVOS y se nombran aqui.
  const NUEVOS_278 = ['title:Buscar Producto', 'title:Buscar Cliente'];
  const deModal = (s: string) => new Set([...s.replace(/\r\n/g, '\n').matchAll(/<Modal\b[^]*?\btitle="([^"]*)"/g)].map((m) => `title:${m[1]}`));
  const lectura = (s: string) => {
    const t = deModal(s);
    return huella(s).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:') && !NUEVOS_278.includes(x))
      .map((x) => (t.has(x) ? `texto:${x.slice(6)}` : x));
  };
  //  Lo que pasa a `titulo="..."`/`descripcion="..."` deja de ser texto entre etiquetas: se quita UNA vez de
  //  lo de antes (la huella no cuenta las palabras sueltas: "Cotizaciones" no estaba), y se exige que el
  //  fuente de antes lo dijera letra por letra (espacios aparte).
  const deCabecera = (s: string) => [...s.replace(/\r\n/g, '\n').matchAll(/\b(?:titulo|descripcion)="([^"]*)"/g)].map((m) => m[1]);
  const plano = (s: string) => s.replace(/\s+/g, ' ');
  let cambiados = 0;
  for (const f of todos) {
    let antes: string;
    try { antes = enCommit(BASE, f); } catch { continue; }
    //  Los DOS commits del lote, no la carpeta: el 260 cambia a proposito los rotulos de e-CF
    //  ("CONSULTAR DGII"), y asi la prueba de que el 272 no cambio ningun texto vale para siempre.
    const ahora = enCommit(LOTE, f);
    const deAntes = lectura(antes);
    const cab = deCabecera(ahora);
    const nuevos = cab.filter((t) => !plano(antes).includes(t));
    for (const t of cab) { const i = deAntes.indexOf(`texto:${t}`); if (i >= 0) deAntes.splice(i, 1); }
    const d = diferencia(deAntes, lectura(ahora));
    if (d.faltan.length || d.sobran.length || nuevos.length) {
      cambiados++;
      console.log(`        ${f}: faltan ${JSON.stringify(d.faltan)} sobran ${JSON.stringify(d.sobran)} cabecera nueva ${JSON.stringify(nuevos)}`);
    }
  }
  invariante(`los textos, placeholder, title, avisos y la API de los ${todos.length} ficheros son los de ${BASE}`, cambiados === 0, `${cambiados} cambiados`);

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main();
