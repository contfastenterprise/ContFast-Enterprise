/**
 * Lote 243 -- en la cabecera, junto a las pestanas no va ningun boton. Pedido
 * del dueño (2026-10-02): "los botones no pueden estar al lado de los tab, coge
 * de referencia la pagina de compras para que sepas como organizar esos
 * botones".
 *
 * Medido en Compras: la cabecera lleva el titulo y, a la derecha, SOLO el
 * conmutador de pestanas; "Imprimir Reporte" y "Buscar Registros" viven dentro
 * de la pestana de la lista, en su barra. En los lotes 240-242 las pestanas se
 * pusieron donde estaba el boton "Nuevo ...", al lado de "Imprimir" o de
 * "Gestion de Codigos": esos botones bajan a la barra de la lista.
 *
 * La regla se BARRE: toda pantalla del panel que use `PestanasDeRegistro` la
 * cumple, tambien las que se conviertan despues. La proxima que deje un boton
 * al lado de las pestanas hace fallar este banco sola.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const PANEL = 'src/app/dashboard';
function paginas(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(raiz, dir)).sort()) {
    const r = `${dir}/${n}`;
    if (statSync(join(raiz, r)).isDirectory()) out.push(...paginas(r));
    else if (/\.tsx$/.test(n)) out.push(r);
  }
  return out;
}

/**
 * Lo que comparte fila con cada `<PestanasDeRegistro>`: desde la ultima caja que se abre antes de ellas hasta
 * la primera que se cierra despues. Si ahi hay un boton, esta al lado de las pestanas.
 */
function vecinos(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<PestanasDeRegistro\b[\s\S]*?\/>/g)) {
    const i = m.index ?? 0;
    const desde = src.lastIndexOf('<div', i);
    const hasta = src.indexOf('</div>', i + m[0].length);
    out.push(src.slice(desde, i) + src.slice(i + m[0].length, hasta < 0 ? undefined : hasta));
  }
  return out;
}

function main() {
  const conPestanas = paginas(PANEL).filter((f) => /<PestanasDeRegistro\b/.test(sinComentarios(leer(f))));
  //  Vale en los dos estados: las cuatro pantallas de Inventario ya llevan el componente (lotes 241 y 242).
  for (const f of ['products/page.tsx', 'warehouses/page.tsx', 'inventory/categories/page.tsx', 'delivery-notes/page.tsx']) {
    if (!conPestanas.includes(`${PANEL}/${f}`)) throw new Error(`Precondicion: ${f} ya no usa PestanasDeRegistro`);
  }

  console.log('\n1) Junto a las pestanas no hay botones\n');
  const conBoton = conPestanas.filter((f) => vecinos(sinComentarios(leer(f))).some((v) => /<button\b|<Button\b/.test(v)));
  ok(`en las ${conPestanas.length} pantallas con pestanas de registro, la fila de las pestanas no lleva ningun boton`, conBoton.length === 0,
    conBoton.map((f) => f.replace(`${PANEL}/`, '')).join(', '));

  console.log('\n2) Los botones siguen estando, en la barra de la lista\n');
  const tramoLista = (src: string, marca: string) => { const i = src.indexOf(marca); return i < 0 ? '' : src.slice(i, src.indexOf('</>)}', i)); };
  //  ...y UNA sola vez: que no se quede una copia en la cabecera.
  const una = (src: string, re: RegExp) => (src.match(re) ?? []).length === 1;
  const prod = sinComentarios(leer(`${PANEL}/products/page.tsx`));
  ok('productos: "Gestión de Códigos" va en la barra del catalogo, con "Imprimir"',
    /router\.push\('\/dashboard\/products\/barcodes'\)[\s\S]{0,500}Gestión de Códigos[\s\S]{0,900}Imprimir listado filtrado/.test(tramoLista(prod, '{!showModal && (<>'))
    && una(prod, /Gestión de Códigos/g));
  const alm = sinComentarios(leer(`${PANEL}/warehouses/page.tsx`));
  ok('almacenes: "Imprimir" va junto al buscador', /<SearchBar[\s\S]{0,400}onClick=\{handlePrintList\}[\s\S]{0,500}Imprimir/.test(tramoLista(alm, '{!isModalOpen && (<>')) && una(alm, /onClick=\{handlePrintList\}/g));
  const cat = sinComentarios(leer(`${PANEL}/inventory/categories/page.tsx`));
  ok('categorias: "Imprimir" va junto al buscador', /<SearchBar[\s\S]{0,500}onClick=\{handlePrintList\}[\s\S]{0,500}Imprimir/.test(tramoLista(cat, '{!showModal && (<>')) && una(cat, /onClick=\{handlePrintList\}/g));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
