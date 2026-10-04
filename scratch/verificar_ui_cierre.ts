/**
 * Lote 275 -- lo que la revision VISUAL de los lotes 271-274 encontro, y que ningun banco veia.
 *
 * Con las pantallas montadas en el navegador (red sustituida) y un medidor de contraste texto a texto:
 *  1. Titulos de seccion y contadores en el dorado de la marca (#C5A059) sobre blanco: 2,4:1 (minimo
 *     4,5:1). No eran <h1>, asi que la cabecera estandar no los alcanzo. Va un dorado PARA TEXTO,
 *     `text-oro-texto` (#8A6A2C), de la misma familia. El de siempre se queda para iconos, rellenos y
 *     texto sobre azul marino (la conciliacion bancaria lo usa asi, y se lee bien).
 *  2. En el movil (375 px), dos filas que no partian: la barra de la lista de productos sacaba cuatro
 *     botones de la pantalla, y los totales del mes de Facturacion estiraban la pagina a 470 px.
 *  3. El estandar escrito daba los pixeles de Tailwind, pero el panel tiene la fuente base a 14 px:
 *     `h-9` son 31,5 px, no 36.
 *
 * Se ejecuta con: npx tsx scratch/verificar_ui_cierre.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

const lum = (hex: string) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Titulos (<h1>-<h4>) de src con el dorado de la marca como color de texto, fuera de la tienda publica. */
function titulosDorados(): string[] {
  const out: string[] = [];
  (function andar(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (!/\[empresa\]|storefront|prueba-ui/.test(p)) andar(p); continue; }
      if (!p.endsWith('.tsx')) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/<h[1-4][^>]*\btext-\[#c5a059\][^>]*>/gi)) out.push(p.slice(raiz.length + 1).replace(/\\/g, '/'));
    }
  })(join(raiz, 'src'));
  return out;
}

const css = leer('src/app/globals.css');
const oro = /--color-oro-texto:\s*#([0-9a-fA-F]{6});/.exec(css)?.[1];

console.log('\n1) El dorado para texto\n');
ok('existe --color-oro-texto y pasa AA sobre blanco, slate-50 y amber-50',
  !!oro && contraste(oro, 'ffffff') >= 4.5 && contraste(oro, 'f8fafc') >= 4.5 && contraste(oro, 'fffbeb') >= 4.5,
  oro ? `${contraste(oro, 'ffffff').toFixed(2)} / ${contraste(oro, 'f8fafc').toFixed(2)}` : 'no existe');
//  Tolerado, por nombre: sobre azul marino el dorado de la marca da mas de 5:1.
const TOLERADOS = ['src/app/dashboard/reports/bank-reconciliation/page.tsx'];
const dorados = titulosDorados();
ok('ningun titulo de seccion lleva el dorado de la marca como texto (salvo el que va sobre azul marino)',
  dorados.every((f) => TOLERADOS.includes(f)), dorados.filter((f) => !TOLERADOS.includes(f)).join(', '));
const compras = leer('src/app/dashboard/purchases/page.tsx');
ok('  en Compras, los titulos de seccion van en el dorado para texto', (compras.match(/<h[34] className="[^"]*\btext-oro-texto\b/g) ?? []).length >= 10);
ok('los contadores "pendientes" de Facturacion y Cotizaciones, tambien',
  /font-bold text-oro-texto">\{stats\?\.pending \?\? 0\}/.test(leer('src/app/dashboard/invoices/page.tsx'))
  && /font-bold text-oro-texto">\{stats\.pending\}/.test(leer('src/app/dashboard/quotes/page.tsx')));
ok('la pestaña activa de Caja, tambien', /'border-\[#c5a059\] text-oro-texto bg-amber-50'/.test(leer('src/app/dashboard/cash/page.tsx')));

console.log('\n2) En el movil, las filas parten\n');
const productos = leer('src/app/dashboard/products/page.tsx');
ok('la barra de la lista de productos (la de "Precios en dolares") parte la fila',
  /<div className="flex flex-wrap items-center gap-2">\s*<Button type="button" variant="secondary" onClick=\{dolar\.abrir\}>/.test(productos));
ok('los totales del mes de Facturacion parten la fila', /<div className="flex flex-wrap gap-4 w-full md:w-auto">/.test(leer('src/app/dashboard/invoices/page.tsx')));

console.log('\n3) El estandar escrito\n');
const estandar = leer('docs/estandar_ui.md');
ok('dice que la base del panel es 14 px y da `h-9` como 31,5 px', /\*\*14 px\*\*/.test(estandar) && /`h-9` \(31,5 px\)/.test(estandar) && !/36 px \(`h-9`\)/.test(estandar));
ok('y nombra el dorado para texto', /`text-oro-texto`/.test(estandar));

console.log('\n4) Lo que no cambia (invariantes)\n');
invariante('la base del panel sigue siendo 14 px (si cambia, el estandar escrito miente)', /html \{\s*font-size: 14px;/.test(css));
invariante('el dorado de la marca sigue existiendo para iconos y rellenos', /#C5A059/i.test(leer('src/components/ui/button-variants.ts')));

console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
