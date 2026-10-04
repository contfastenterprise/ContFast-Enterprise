/**
 * Lote 270 -- el estandar de botones, cabeceras y pies de formulario (auditoria de UI, 2026-10-03).
 *
 * La auditoria conto 712 botones: 30 con el componente `Button` (que salia sin color, lote 269) y
 * el resto escritos a mano, en tres formas que se repiten letra por letra (45 primarios azul marino,
 * 34 secundarios blancos, 19 dorados de imprimir) y un centenar de variaciones de alto, radio y letra.
 * El lote convierte esas tres formas en las variantes del componente y añade la cabecera de pagina,
 * el pie de formulario y el boton de solo icono. Las pantallas se pasan en los lotes siguientes; este
 * deja ademas un TRINQUETE: lo escrito a mano no puede crecer.
 *
 * Se DIBUJAN los componentes con react-dom/server y se mira el HTML.
 *
 * Se ejecuta con: npx tsx scratch/verificar_estandar_de_botones.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean, d = '') => { try { ok(t, f(), d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = React.createElement;
const clases = (html: string, i = 0) => new Set(([...html.matchAll(/class="([^"]*)"/g)][i]?.[1] ?? '').split(/\s+/));
const tiene = (html: string, ...cs: string[]) => { const c = clases(html); return cs.every((x) => c.has(x)); };

/** Botones escritos a mano con las clases de un boton de la casa, en todo src. */
function contarAMano(): { primario: number; secundario: number; documento: number; iconoSinNombre: number } {
  const r = { primario: 0, secundario: 0, documento: 0, iconoSinNombre: 0 };
  (function andar(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (!p.includes('prueba-ui')) andar(p); continue; }
      if (!p.endsWith('.tsx') || p.includes(join('components', 'ui', 'button.tsx'))) continue;
      const s = readFileSync(p, 'utf8');
      const re = /<button\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        let k = m.index + 7, prof = 0;
        for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
        const attrs = s.slice(m.index, k);
        const cuerpo = s.slice(k + 1, s.indexOf('</button>', k));
        if (/bg-\[#003366\][^"`]*hover:bg-\[#002244\]/.test(attrs)) r.primario++;
        if (/bg-white text-slate-700 border border-slate-300 hover:bg-slate-50/.test(attrs)) r.secundario++;
        if (/bg-\[#C5A059\] hover:bg-\[#b08c4a\] text-slate-950/i.test(attrs)) r.documento++;
        const texto = cuerpo.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, (x) => (x.match(/'[^']+'|"[^"]+"/g) ?? []).join('')).trim();
        if (!texto && !/aria-label=/.test(attrs) && !/\btitle=/.test(attrs)) r.iconoSinNombre++;
      }
    }
  })(join(raiz, 'src'));
  return r;
}

async function main() {
  const RUTA_BOTON = 'src/components/ui/button.tsx';
  const RUTA_CAB = 'src/components/ui/cabecera-de-pagina.tsx';
  const RUTA_PIE = 'src/components/ui/acciones-de-formulario.tsx';
  if (!existsSync(resolve(raiz, RUTA_BOTON))) throw new Error('Precondicion: no esta el componente Button');
  const B: AnyRec = await import('../src/components/ui/button');
  const C: AnyRec | null = existsSync(resolve(raiz, RUTA_CAB)) ? await import('../src/components/ui/cabecera-de-pagina') : null;
  const P: AnyRec | null = existsSync(resolve(raiz, RUTA_PIE)) ? await import('../src/components/ui/acciones-de-formulario') : null;

  console.log('\n1) Las variantes son los botones de la casa\n');
  const boton = (props: AnyRec, txt = 'Guardar') => renderToStaticMarkup(h(B.Button, props, txt));
  intenta('el primario por defecto: azul marino, hover #002244, texto blanco, h-9 px-4 rounded-lg font-bold text-sm',
    () => tiene(boton({}), 'bg-primary', 'hover:bg-primary-variant', 'text-primary-foreground', 'h-9', 'px-4', 'rounded-lg', 'font-bold', 'text-sm', 'shadow-md'));
  intenta('  el secundario: blanco, borde slate-300, texto slate-700 (el "Cancelar" de la casa)',
    () => tiene(boton({ variant: 'secondary' }), 'bg-white', 'border', 'border-slate-300', 'text-slate-700', 'hover:bg-slate-50', 'h-9'));
  intenta('  el de documento: el dorado de "Imprimir" con texto oscuro',
    () => tiene(boton({ variant: 'documento' }), 'bg-[#C5A059]', 'hover:bg-[#b08c4a]', 'text-slate-950'));
  intenta('  el destructivo con el color del tema, y el aviso con texto oscuro (blanco sobre ambar no pasa)',
    () => tiene(boton({ variant: 'destructive' }), 'bg-destructive', 'text-destructive-foreground') && tiene(boton({ variant: 'warning' }), 'bg-amber-500', 'text-slate-950'));
  intenta('sm = h-8 (barras y tablas), lg = h-10, icon-sm = 32 px',
    () => tiene(boton({ size: 'sm' }), 'h-8', 'text-xs') && tiene(boton({ size: 'lg' }), 'h-10') && tiene(boton({ size: 'icon-sm' }), 'size-8'));
  intenta('sin escala al pasar el raton: es un <button> normal, no uno de framer-motion',
    () => !/framer-motion/.test(readFileSync(resolve(raiz, RUTA_BOTON), 'utf8')) && boton({}).startsWith('<button'));
  intenta('cargando: giro, desactivado y aria-busy',
    () => { const x = boton({ isLoading: true }); return /disabled=""/.test(x) && /aria-busy="true"/.test(x) && /animate-spin/.test(x); });
  invariante('el foco se ve: anillo del primario (ya lo tenia)', tiene(boton({}), 'focus-visible:ring-2', 'focus-visible:ring-ring'));

  console.log('\n2) Solo icono: aria-label obligatorio\n');
  intenta('IconButton pinta su aria-label y lo repite como globo',
    () => { const x = renderToStaticMarkup(h(B.IconButton, { 'aria-label': 'Editar cliente' }, h('svg'))); return /aria-label="Editar cliente"/.test(x) && /title="Editar cliente"/.test(x) && tiene(x, 'size-8'); });
  intenta('  y el tipo lo exige (sin aria-label no compila)',
    () => /"aria-label": string;/.test(readFileSync(resolve(raiz, RUTA_BOTON), 'utf8')));

  console.log('\n3) La cabecera de pagina\n');
  if (!C) for (const t of ['titulo a la izquierda, acciones a la derecha en escritorio', '  y debajo en el movil, sin cortarse', 'el titulo es azul marino (no dorado: 2,4:1)']) ok(t, false, `no existe ${RUTA_CAB}`);
  else {
    const x = renderToStaticMarkup(h(C.CabeceraDePagina, { titulo: 'Clientes', descripcion: 'Gestiona', acciones: h('button', { type: 'button' }, 'Accion') }));
    ok('titulo a la izquierda, acciones a la derecha en escritorio', /<header class="[^"]*md:flex-row[^"]*justify-between/.test(x) && x.indexOf('<h1') < x.indexOf('Accion'));
    ok('  y debajo en el movil, sin cortarse', /flex-col/.test(x) && /flex-wrap[^"]*md:justify-end|md:justify-end[^"]*flex-wrap/.test(x));
    ok('el titulo es azul marino (no dorado: 2,4:1)', /<h1 class="[^"]*text-primary/.test(x) && !/<h1 class="[^"]*#c5a059/i.test(x));
  }

  console.log('\n4) El pie del formulario\n');
  if (!P) for (const t of ['Cancelar primero y la principal la ultima', '  y una accion de mas va ENTRE las dos (la principal sigue la ultima)', '  a la derecha en escritorio; en el movil, la principal arriba', 'confirmar un borrado usa el destructivo', 'guardando: la principal se desactiva, Cancelar no']) ok(t, false, `no existe ${RUTA_PIE}`);
  else {
    const x = renderToStaticMarkup(h(P.AccionesDeFormulario, { textoPrincipal: 'Guardar', alCancelar: () => {} }));
    ok('Cancelar primero y la principal la ultima', x.indexOf('Cancelar') > -1 && x.indexOf('Cancelar') < x.indexOf('Guardar'));
    const e = renderToStaticMarkup(h(P.AccionesDeFormulario, { textoPrincipal: 'Guardar', alCancelar: () => {} }, h('button', { type: 'button' }, 'Borrador')));
    ok('  y una accion de mas va ENTRE las dos (la principal sigue la ultima)', e.indexOf('Cancelar') < e.indexOf('Borrador') && e.indexOf('Borrador') < e.indexOf('Guardar'));
    ok('  a la derecha en escritorio; en el movil, la principal arriba', /flex-col-reverse/.test(x) && /sm:justify-end/.test(x));
    const d = renderToStaticMarkup(h(P.AccionesDeFormulario, { textoPrincipal: 'Eliminar', variantePrincipal: 'destructive', alCancelar: () => {} }));
    ok('confirmar un borrado usa el destructivo', /bg-destructive[^"]*"[^>]*>Eliminar|bg-destructive/.test(d) && clases(d, 2).has('bg-destructive'));
    const g = renderToStaticMarkup(h(P.AccionesDeFormulario, { textoPrincipal: 'Guardar', guardando: true, alCancelar: () => {} }));
    const botones = [...g.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    ok('guardando: la principal se desactiva, Cancelar no', botones.length === 2 && !/ disabled=""/.test(botones[0]) && / disabled=""/.test(botones[1]));
  }

  console.log('\n5) Trinquete: lo escrito a mano no crece\n');
  //  Techos medidos al abrir el lote. Cada lote que pase pantallas al componente los BAJA.
  const TECHO = { primario: 5, secundario: 0, documento: 1, iconoSinNombre: 19 };
  const hoy = contarAMano();
  for (const k of Object.keys(TECHO) as (keyof typeof TECHO)[]) invariante(`${k}: ${hoy[k]} (techo ${TECHO[k]})`, hoy[k] <= TECHO[k]);

  console.log('\n6) Lo que no cambia (invariantes)\n');
  invariante('los 30 usos de <Button> siguen compilando con sus variantes (outline, ghost, warning, primary, success, secondary, destructive)',
    ['outline', 'ghost', 'warning', 'primary', 'success', 'secondary', 'destructive', 'default'].every((v) => { try { return boton({ variant: v }).length > 0; } catch { return false; } }));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
