/**
 * Lote 271 -- el grupo INVENTARIO al estandar de UI (auditoria de UI del 2026-10-03, `docs/estandar_ui.md`).
 *
 * Pantallas: productos (catalogo, codigos de barra y precios en dolares), almacenes, categorias,
 * movimientos, reorden, traslados, ajustes de inventario, conduces y notas de credito/debito
 * (`/dashboard/adjustments`). Solo UI: ni calculos, ni permisos, ni llamadas a la API, ni lo que hace
 * cada boton. Lo que el lote cambia, y este banco vigila:
 *
 *  · los botones escritos a mano con las clases de la casa pasan a `<Button>`; los "a mano" con otras
 *    alturas, radios o letra pierden la desviacion (`rounded-xl`, `py-2.5`, `px-6`, `font-semibold`...);
 *  · todo boton de solo icono dice que hace (`aria-label`), casi todos ya como `IconButton`;
 *  · los pies de formulario limpios son `<AccionesDeFormulario>` ([Cancelar] [Principal], a la derecha);
 *  · las once cabeceras son `<CabeceraDePagina>`: ningun `<h1>` escrito a mano queda en el grupo;
 *  · `Edit2` pasa a `Pencil`; todo boton con `onClick` lleva su `type`.
 *
 * Y como INVARIANTE (codigo 3): los textos visibles, `placeholder`, `title`, avisos y direcciones de la
 * API de cada fichero son los de `57f741d` (la base del lote). Las clases cambian a proposito y no se
 * comparan; los `aria-label` nuevos son añadidos y tampoco.
 *
 * Excepcion anotada: el boton partido de "Imprimir" de productos (`Imprimir listado filtrado` y su
 * desplegable `Más opciones de impresión`): dos mitades `rounded-l-lg`/`rounded-r-lg` de un mismo
 * control, `h-full` y `border-l`. El componente no tiene esa forma y se deja como esta.
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ui_inventario.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { huella, diferencia } from './huellaDePantalla';

const raiz = resolve(__dirname, '..');
const BASE = '57f741d';
const DIRS = ['src/app/dashboard/products', 'src/app/dashboard/warehouses', 'src/app/dashboard/inventory', 'src/app/dashboard/delivery-notes', 'src/app/dashboard/adjustments'];
//  Las paginas con titulo: las once pasan a la cabecera de la casa.
const CON_CABECERA = [
  'products/page.tsx', 'products/barcodes/page.tsx', 'warehouses/page.tsx', 'inventory/categories/page.tsx',
  'inventory/movements/page.tsx', 'inventory/reorder/page.tsx', 'inventory/transfer/page.tsx',
  'inventory/adjustments/page.tsx', 'delivery-notes/page.tsx', 'adjustments/page.tsx',
].map((f) => `src/app/dashboard/${f}`);
//  Los pies limpios ([Cancelar] [Principal]) que pasan al componente, por fichero y cuantos.
const PIES: Record<string, number> = {
  'src/app/dashboard/products/page.tsx': 2,
  'src/app/dashboard/products/barcodes/page.tsx': 1,
  'src/app/dashboard/inventory/categories/page.tsx': 1,
  'src/app/dashboard/delivery-notes/components/FormularioDeConduce.tsx': 1,
  'src/app/dashboard/adjustments/page.tsx': 1,
};
//  El boton partido de Imprimir (ver cabecera): se reconoce por su `title`, no por su linea.
const EXCEPCIONES = ['title="Imprimir listado filtrado"', 'title="Más opciones de impresión"'];

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');
const enBase = (p: string) => execFileSync('git', ['show', `${BASE}:${p}`], { cwd: raiz, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/\r\n/g, '\n');
//  Los comentarios se blanquean conservando los saltos de linea: asi las lineas que se citan son las del fichero.
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

/** Cada `<button>`, `<Button>` e `<IconButton>` del fichero: su etiqueta de apertura y su cuerpo. */
function botones(src: string): { tag: string; abre: string; cuerpo: string; linea: number }[] {
  const out: { tag: string; abre: string; cuerpo: string; linea: number }[] = [];
  const re = /<(button|Button|IconButton)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const abre = src.slice(m.index, k + 1);
    const cierre = abre.endsWith('/>') ? k + 1 : src.indexOf(`</${m[1]}>`, k);
    out.push({ tag: m[1], abre, cuerpo: abre.endsWith('/>') ? '' : src.slice(k + 1, cierre < 0 ? undefined : cierre), linea: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** ¿Dice algo el cuerpo de un boton sin el icono? Texto con letras, o una expresion que no es solo iconos. */
function tieneTexto(cuerpo: string): boolean {
  let texto = '';
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (c === '<') { let p = 0; for (; i < cuerpo.length; i++) { const d = cuerpo[i]; if (d === '{') p++; else if (d === '}') p--; else if (d === '>' && p === 0) break; } continue; }
    if (c === '{') {
      let p = 0, j = i;
      for (; j < cuerpo.length; j++) { if (cuerpo[j] === '{') p++; else if (cuerpo[j] === '}') { p--; if (p === 0) break; } }
      const expr = cuerpo.slice(i + 1, j);
      if (/(['"`])[^'"`]*[A-Za-zÁÉÍÓÚáéíóúñ][^'"`]*\1/.test(expr) || (!/</.test(expr) && /\w/.test(expr))) texto += ' x ';
      i = j;
      continue;
    }
    texto += c;
  }
  return /[A-Za-zÁÉÍÓÚáéíóúñ]/.test(texto);
}

const CASA = [
  /bg-\[#003366\][^"`]*\btext-white|text-white[^"`]*bg-\[#003366\]/,
  /bg-white[^"`]*text-slate-700[^"`]*border-slate-3/,
  /bg-\[#c5a059\]/i,
  /bg-\[#001e40\]|bg-primary text-on-primary/,
];
const DESVIACION = /(^|\s)(h-9|h-10|h-12|py-[0-9.]+|px-[1-9][0-9.]*|rounded-(md|xl|2xl)|rounded(?=\s|$)|font-semibold|transition-colors|disabled:opacity-40|hover:-translate-\S+)(?=\s|$)/;

/** Lo visible que no es clase ni aria-label (la huella de los lotes 253-255). */
//  Lote 277: el titulo de una ventana pasa del texto de su `<h3>` a la propiedad `title` del `<Modal>`.
//  Es el mismo texto visible: cuenta como texto, no como el atributo `title` (el globo de un boton).
//  `[^<]*?`: no salta de un `<Modal` cuyo titulo no es una cadena a un `title=` de otro elemento.
const titulosDeVentana = (src: string): string[] => [...src.replace(/\r\n/g, '\n').matchAll(/<Modal\b[^<]*?\btitle="([^"]*)"/g)].map((m) => m[1]);
const visibles = (src: string): string[] => {
  const h = huella(src).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:'));
  for (const t of titulosDeVentana(src)) { const i = h.indexOf(`title:${t}`); if (i >= 0) h.splice(i, 1, `texto:${t}`); }
  return h;
};
/**
 * Los textos que ahora viajan como PROPIEDAD de un componente (titulo, descripcion, texto del pie, y el
 * "Cancelar" que pone `AccionesDeFormulario`). La huella no los veia antes cuando eran una sola palabra o
 * iban detras de una expresion (`{icono} Emitir Nota`), asi que no se exige verlos en la huella de antes:
 * se exige que esten, LETRA POR LETRA, en el fichero de antes.
 */
function textosDePropiedad(src: string): string[] {
  const s = sinComentarios(src);
  const salida: string[] = [];
  for (const m of s.matchAll(/\b(titulo|descripcion|textoPrincipal|textoCancelar)="([^"]*)"/g)) salida.push(`texto:${m[2]}`);
  for (const m of s.matchAll(/<AccionesDeFormulario\b([\s\S]*?)\n\s*\/>/g)) {
    if (/\balCancelar=/.test(m[1]) && !/\btextoCancelar=/.test(m[1])) salida.push('texto:Cancelar');
  }
  return salida;
}

async function main() {
  const todos = ficheros();
  for (const f of [...CON_CABECERA, ...Object.keys(PIES)]) if (!todos.includes(f)) throw new Error(`Precondicion: no esta ${f}`);
  const fuente = new Map(todos.map((f) => [f, sinComentarios(leer(f))]));

  console.log('\n1) Botones de la casa: el componente, sin desviaciones\n');
  const aMano: string[] = [];
  const desviados: string[] = [];
  for (const [f, s] of fuente) {
    for (const b of botones(s)) {
      const corto = `${f.replace('src/app/dashboard/', '')}:${b.linea}`;
      //  Solo la clase FIJA: un boton de la casa la lleva siempre igual. Una clase que cambia con el estado
      //  (`className={`...${activo ? 'bg-[#003366] text-white' : ...}`}`) es una pestaña o un filtro, no una accion.
      const cls = b.abre.match(/className="([^"]*)"/)?.[1];
      if (b.tag === 'button' && cls && CASA.some((re) => re.test(cls)) && !EXCEPCIONES.some((e) => b.abre.includes(e))) aMano.push(corto);
      if (b.tag !== 'button' && cls && DESVIACION.test(cls) && !(/variant="link"/.test(b.abre) && !DESVIACION.test(cls.replace(/\b(h-auto|px-0)\b/g, '')))) desviados.push(`${corto} (${cls.match(DESVIACION)?.[2]})`);
    }
  }
  ok('ningun <button> escrito a mano con el aspecto de un boton de la casa (azul marino, blanco, dorado), salvo el Imprimir partido', aMano.length === 0, aMano.slice(0, 8).join(', '));
  ok('  y ningun <Button>/<IconButton> con forma escrita a mano (h-9, py-*, px-*, rounded-xl, font-semibold, opacity-40...)', desviados.length === 0, desviados.slice(0, 8).join(', '));
  const excepcionesSiguen = EXCEPCIONES.every((e) => [...fuente.values()].some((s) => s.includes(e)));
  //  Cierto antes y despues: las dos mitades siguen escritas a mano, a proposito.
  invariante('la excepcion anotada sigue ahi: el Imprimir partido de productos, sus dos mitades', excepcionesSiguen);

  console.log('\n2) Solo icono: dicen que hacen\n');
  const mudos: string[] = [];
  const sinTipo: string[] = [];
  for (const [f, s] of fuente) {
    for (const b of botones(s)) {
      const corto = `${f.replace('src/app/dashboard/', '')}:${b.linea}`;
      if (!tieneTexto(b.cuerpo) && !/\baria-label=/.test(b.abre)) mudos.push(corto);
      if (/\bonClick=/.test(b.abre) && !/\btype=/.test(b.abre)) sinTipo.push(corto);
    }
  }
  ok('todo boton de solo icono del grupo lleva aria-label', mudos.length === 0, mudos.slice(0, 8).join(', '));
  //  Se DIBUJA la tabla de conduces: lo que llega al lector de pantalla, no lo que dice el fuente.
  try {
    const T = await import('../src/app/dashboard/delivery-notes/components/TablaDeConduces');
    const nada = () => {};
    const html = renderToStaticMarkup(React.createElement(T.TablaDeConduces, {
      notes: [{ id: 'a', deliveryNumber: 'CON-1', status: 'draft', deliveryDate: '2026-10-03', invoiceNcf: 'E31', customerName: 'X' }],
      onVer: nada, onImprimir: nada, onAprobar: nada, onAnular: nada,
    } as never));
    const bs = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    ok('  dibujada, la fila de un borrador: sus cuatro acciones dicen que hacen y sobre que conduce',
      bs.length === 4 && bs.every((b) => /aria-label="[^"]*CON-1[^"]*"/.test(b)), `${bs.length} botones`);
  } catch (e) { ok('  dibujada, la fila de un borrador: sus cuatro acciones dicen que hacen y sobre que conduce', false, `lanzo: ${(e as Error).message}`); }
  ok('todo boton con onClick lleva su type (submit solo el que envia)', sinTipo.length === 0, sinTipo.slice(0, 8).join(', '));

  console.log('\n3) Pies de formulario: [Cancelar] [Principal]\n');
  const pies = Object.entries(PIES).map(([f, n]) => [f, ((fuente.get(f) ?? '').match(/<AccionesDeFormulario\b/g) ?? []).length, n] as const);
  ok('los seis pies limpios son <AccionesDeFormulario> (producto, categoria nueva, etiquetas, categorias, conduce, nota)',
    pies.every(([, hay, n]) => hay === n), pies.filter(([, hay, n]) => hay !== n).map(([f, hay, n]) => `${f.split('/').slice(-2).join('/')} ${hay}/${n}`).join(', '));
  //  Cierto antes y despues: en este grupo no habia ningun pie al reves. Que no aparezca.
  const alReves = [...fuente.entries()].filter(([, s]) => /type="submit"[\s\S]{0,600}?>\s*(?:<[^>]+>\s*)*Cancelar\s*</.test(s)).map(([f]) => f);
  invariante('ningun pie con la principal antes que Cancelar', alReves.length === 0, alReves.join(', '));

  console.log('\n4) Cabeceras\n');
  const conH1 = [...fuente.entries()].filter(([, s]) => /<h1\b/.test(s)).map(([f]) => f.replace('src/app/dashboard/', ''));
  const sinCab = CON_CABECERA.filter((f) => !/<CabeceraDePagina\b/.test(fuente.get(f) ?? '') || !/import \{ CabeceraDePagina \} from '@\/components\/ui\/cabecera-de-pagina'/.test(fuente.get(f) ?? ''));
  ok('las diez paginas usan <CabeceraDePagina> (y la importan)', sinCab.length === 0, sinCab.join(', '));
  ok('  y no queda ningun <h1> escrito a mano en el grupo', conH1.length === 0, conH1.join(', '));
  //  Cierto antes: en este grupo el dorado estaba en los iconos, no en el texto del titulo.
  const dorados = [...fuente.entries()].filter(([, s]) => /<h1\b[^>]*(#c5a059|amber-)/i.test(s)).map(([f]) => f);
  invariante('ningun <h1> dorado (2,4:1)', dorados.length === 0, dorados.join(', '));
  //  Con pestañas de registro, las pestañas van SOLAS en las acciones (lote 243).
  const pestanas = [...fuente.entries()].filter(([, s]) => /<PestanasDeRegistro\b/.test(s));
  ok('  con pestañas de registro, las pestañas son las acciones de la cabecera, y solas',
    pestanas.length >= 4 && pestanas.every(([f, s]) => f.endsWith('delivery-notes/page.tsx')
      ? /acciones=\{<PestanasDeRegistro\b[^]*?\/>\}/.test(s)
      : /acciones=\{\s*<PestanasDeRegistro\b[\s\S]*?\/>\s*\}/.test(s)));

  console.log('\n5) Iconos\n');
  const viejos = [...fuente.entries()].filter(([, s]) => /import\s*\{[^}]*\b(Edit|Edit2|ListFilter|SlidersHorizontal)\b[^}]*\}\s*from 'lucide-react'/.test(s)).map(([f]) => f.replace('src/app/dashboard/', ''));
  ok('Editar es Pencil: ningun Edit/Edit2 (ni ListFilter/SlidersHorizontal) en el grupo', viejos.length === 0, viejos.join(', '));

  console.log('\n6) Lo que no cambia (invariantes)\n');
  const cambiados: string[] = [];
  for (const f of todos) {
    let antes: string;
    try { antes = enBase(f); } catch { continue; }
    //  LOTE 285: DOS COMMITS, no la carpeta (como en los lotes 227 y 230). El 285 pide a proposito una
    //  ruta nueva desde productos (`/api/v1/products/stock-bajo`, la tarjeta "Stock Bajo"); la prueba de
    //  este lote sigue siendo la misma entre 57f741d y 696854e, el ultimo main en que se comprobo.
    let ahora: string;
    try { ahora = execFileSync('git', ['show', `696854e:${f}`], { cwd: raiz, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).replace(/\r\n/g, '\n'); } catch { continue; }
    const deProp = textosDePropiedad(ahora);
    const d = diferencia(visibles(antes), [...visibles(ahora), ...deProp]);
    //  Lo que sobra solo vale si es un texto de propiedad que ya estaba escrito en el fichero de antes.
    d.sobran = d.sobran.filter((x) => !(deProp.includes(x) && antes.includes(x.slice('texto:'.length))));
    if (d.faltan.length || d.sobran.length) cambiados.push(`${f.replace('src/app/dashboard/', '')}: faltan ${JSON.stringify(d.faltan.slice(0, 3))} sobran ${JSON.stringify(d.sobran.slice(0, 3))}`);
  }
  invariante(`los textos, placeholder, title, avisos y direcciones de la API de los ${todos.length} ficheros son los de ${BASE}`, cambiados.length === 0, cambiados.join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
