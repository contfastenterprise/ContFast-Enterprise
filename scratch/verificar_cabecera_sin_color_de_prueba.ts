/**
 * Lote 301: la barra de arriba del panel no cambia de color en PRUEBA.
 *
 * Pedido del dueño (2026-10-05): *"cuando esta en modo prueba el header no debe
 * cambiar el color"*. Hasta 0203b76 la barra era negra en PRUEBA
 * (`bg-zinc-950 text-white border-red-500/20 shadow-md`) y el degradado celeste en
 * PRODUCCION. Ahora lleva el de PRODUCCION en los dos.
 *
 * Y despues, en el mismo lote, el dueño retiro la franja rayada de MODO PRUEBA ("hay
 * un indicador que dice cuando esta en prueba o produccion"): la barra va siempre en
 * `top-0` y el contenido y el menu dejan el mismo hueco (`pt-14`) en los dos entornos.
 * El entorno lo dice el punto junto a la campana (`InsigniaEntorno`).
 *
 * Lo que se comprueba:
 *   1. la regla (`src/app/dashboard/barraSuperior.ts`) EJECUTADA: mismas clases de
 *      fondo, texto, borde y sombra en los dos entornos, y son las de PRODUCCION de
 *      la base (0203b76, un COMMIT, no una rama);
 *   2. el contraste del texto sobre cada parada del degradado (AA, 4,5:1);
 *   3. la barra DIBUJADA con `react-dom/server` en los dos entornos;
 *   4. el cableado: `ClientLayout` usa la regla y dentro del `<nav>` nada mas mira el
 *      entorno, salvo el punto de `InsigniaEntorno`; las piezas de la barra (selector
 *      de empresa, campana, avatar) no conocen el entorno.
 *   5. sin franja: ni su advertencia ni su degradado, la barra en `top-0`, el contenido y el
 *      menu con el mismo hueco en los dos entornos, y sin el estado que solo la servia.
 * Invariantes (ciertas antes y despues): el punto del entorno sigue junto a la campana y
 * distingue los dos entornos.
 *
 * Se corre con: node node_modules/tsx/dist/cli.mjs scratch/verificar_cabecera_sin_color_de_prueba.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
const BASE = '0203b76';
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean, d = '') => { try { ok(t, f(), d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = React.createElement;

const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');
/** Quita comentarios de bloque, de JSX y de linea: la prosa no cuenta (lote 205). */
const sinComentarios = (s: string) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"])\/\/[^\r\n]*/g, '$1');
const tokens = (c: string) => c.split(/\s+/).filter(Boolean);
const sinPosicion = (c: string) => tokens(c).filter((t) => !/^top-/.test(t)).sort().join(' ');
const nombra = (s: string, id: string) => new RegExp(`\\b${id}\\b`).test(s);

//  Colores de Tailwind que usa la barra (hex de la paleta). Si la barra pasa a otro
//  color, el banco no lo conoce y lo dice: hay que medirlo, no suponerlo.
const HEX: Record<string, string> = {
  'slate-900': '#0f172a', 'sky-50': '#f0f9ff', 'blue-50': '#eff6ff', 'indigo-100': '#e0e7ff',
  'zinc-950': '#09090b', white: '#ffffff',
};
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function main() {
  const RUTA_LAYOUT = 'src/app/dashboard/ClientLayout.tsx';
  const RUTA_REGLA = 'src/app/dashboard/barraSuperior.ts';
  const PIEZAS = ['src/components/ui/selector-de-empresa.tsx', 'src/components/ui/menu-del-usuario.tsx', 'src/components/ui/campana-avisos.tsx'];

  //  PRECONDICION, valida en los dos estados: la base tenia los dos colores, y de ahi
  //  sale la paleta de PRODUCCION contra la que se compara.
  const base = execFileSync('git', ['show', `${BASE}:${RUTA_LAYOUT}`], { cwd: raiz, encoding: 'utf8' });
  const mProd = base.match(/:\s*'top-0 ([^']+)'/);
  if (!/bg-zinc-950/.test(base) || !mProd) throw new Error(`Precondicion: ${BASE} no trae la barra negra y la clara`);
  const paletaProduccion = mProd[1];

  const R: AnyRec | null = existsSync(resolve(raiz, RUTA_REGLA)) ? await import('../src/app/dashboard/barraSuperior') : null;
  //  La regla ya no recibe nada: ni el entorno ni la franja (que se retiro). Antes de este
  //  lote no existia; con el parametro de la primera mitad del lote, `regla()` daria la
  //  posicion `top-0` igual, asi que lo que vigila el no-parametro es la comprobacion 5.
  const regla = (_prueba?: boolean): string => { if (!R) throw new Error('no esta barraSuperior.ts'); return R.clasesDeLaBarra(); };

  console.log('\n1) La regla: el mismo color en PRUEBA y en PRODUCCION\n');
  intenta('fondo, texto, borde y sombra: los de PRODUCCION de la base, uno por uno',
    () => sinPosicion(regla()) === sinPosicion(paletaProduccion), R ? sinPosicion(regla()) : '');
  intenta('no queda nada del negro (zinc, texto blanco, borde rojo, sombra fuerte)',
    () => !/\b(bg-zinc-\d+|text-white|border-red-[\w/]+|shadow-md)\b/.test(regla()), R ? regla() : '');
  intenta('la barra va arriba del todo (top-0), sin franja que esquivar',
    () => tokens(regla()).includes('top-0') && !tokens(regla()).some((t) => /^top-(?!0$)/.test(t)));

  console.log('\n2) Contraste del texto de la barra (AA) en PRUEBA\n');
  intenta('el texto contra cada parada del degradado, al menos 4,5:1', () => {
    const t = tokens(regla(true));
    const texto = t.find((x) => /^text-(slate|zinc|white|black|gray)/.test(x))?.replace(/^text-/, '');
    const fondos = t.filter((x) => /^(from|via|to)-/.test(x) || /^bg-(?!gradient)/.test(x)).map((x) => x.replace(/^(from|via|to|bg)-/, ''));
    if (!texto || !HEX[texto] || fondos.length === 0 || fondos.some((f) => !HEX[f])) throw new Error(`color sin medir: ${texto} / ${fondos.join(',')}`);
    return fondos.every((f) => contraste(HEX[texto], HEX[f]) >= 4.5);
  });

  console.log('\n3) La barra dibujada en los dos entornos\n');
  const { default: SelectorDeEmpresa } = await import('../src/components/ui/selector-de-empresa');
  const { default: MenuDelUsuario } = await import('../src/components/ui/menu-del-usuario');
  const { default: InsigniaEntorno } = await import('../src/components/ui/insignia-entorno');
  const dibujar = (prueba: boolean) => renderToStaticMarkup(h('nav', {
    className: `backdrop-blur-md h-14 fixed left-0 z-50 border-b ${regla(prueba)}`,
  },
  h(SelectorDeEmpresa, { companyName: 'LATIN DOORS', companies: [], rol: 'sistemas', companyId: 'x', onSwitchCompany: () => {}, switching: false }),
  h('div', { 'data-insignia': '' }, h(InsigniaEntorno, { entorno: prueba ? 'TEST' : 'PROD' })),
  h(MenuDelUsuario, { nombre: 'Ana', rol: 'sistemas', onCerrarSesion: () => {} })));
  intenta('la clase del <nav> dibujado es la misma salvo la posicion', () => {
    const c = (html: string) => (html.match(/^<nav class="([^"]*)"/)?.[1] ?? '');
    return sinPosicion(c(dibujar(true))) === sinPosicion(c(dibujar(false)));
  });
  intenta('y todo lo de dentro (selector, avatar) sale igual; solo cambia el punto del entorno', () => {
    const sinInsignia = (html: string) => html.replace(/^<nav class="[^"]*">/, '').replace(/<div data-insignia="">[\s\S]*?<\/div><\/div><\/div><\/div>/, '');
    const a = sinInsignia(dibujar(true)); const b = sinInsignia(dibujar(false));
    return a === b && a.length > 100;
  });

  console.log('\n4) El cableado\n');
  const layout = leer(RUTA_LAYOUT);
  const codigo = sinComentarios(layout);
  const iNav = codigo.indexOf('<nav');
  const nav = iNav > -1 ? codigo.slice(iNav, codigo.indexOf('</nav>', iNav)) : '';
  if (nav === '') throw new Error('Precondicion: no se acota el <nav> de ClientLayout');
  ok('ClientLayout importa la regla', /import\s*\{[^}]*\bclasesDeLaBarra\b[^}]*\}\s*from\s*'\.\/barraSuperior'/.test(codigo));
  //  Acotado a la ETIQUETA de apertura del <nav> (hasta su `)}>`), y sin ningun color
  //  escrito a mano al lado: la regla tiene que ser la unica que pinta la barra.
  const apertura = nav.slice(0, nav.indexOf(')}>') + 3);
  ok('y el <nav> la usa para su clase, sin colores escritos al lado',
    /clasesDeLaBarra\(\)/.test(apertura)
    && !/\b(bg|text|border|from|via|to)-(?!b\b)[a-z]+-\d/.test(apertura));
  //  ATADA a la marca positiva: sin la regla, "no hay zinc" no dice nada.
  ok('dentro del <nav> no queda ningun color del negro',
    nombra(nav, 'clasesDeLaBarra') && !/zinc-9\d\d|text-white|border-red-500/.test(nav));
  ok('dentro del <nav>, el entorno solo lo mira el punto del entorno', (() => {
    const resto = nav
      .replace(/clasesDeLaBarra\(\)/, '')
      .replace(/<InsigniaEntorno entorno=\{entorno\} \/>/, '');
    return nombra(nav, 'clasesDeLaBarra') && !nombra(resto, 'activeEnvironment') && !nombra(resto, 'entorno') && !/'PRUEBA'/.test(resto);
  })());
  ok('las piezas de la barra no conocen el entorno (selector, avatar, campana)',
    nombra(nav, 'clasesDeLaBarra') && PIEZAS.every((p) => {
      const s = sinComentarios(leer(p));
      return !nombra(s, 'entorno') && !nombra(s, 'activeEnvironment') && !nombra(s, 'dgiiEnv') && !/'PRUEBA'|'TEST'/.test(s);
    }));

  console.log('\n5) Sin la franja de MODO PRUEBA (decision del dueño)\n');
  const sidebar = sinComentarios(leer('src/components/ui/new-app-sidebar.tsx'));
  //  Las negaciones van ATADAS a la marca positiva (la regla usada en el <nav>): en un
  //  fichero que no tuviera nada, "no hay franja" seria cierto de balde.
  ok('no queda la franja: ni su advertencia ni su degradado rayado',
    nombra(nav, 'clasesDeLaBarra') && !/FISCALMENTE NULAS|MODO PRUEBA \(SANDBOX\)/.test(codigo) && !/repeating-linear-gradient/.test(codigo));
  ok('el contenido deja el mismo hueco en los dos entornos (pt-14, sin pt-24)',
    /'pt-14'/.test(codigo) && !/pt-24/.test(codigo));
  ok('y el menu lateral tambien (su hueco ya no mira el entorno)',
    /const topOffset = 'pt-14';/.test(sidebar) && !/pt-24/.test(sidebar));
  ok('fuera el estado que solo servia a la franja (activeEnvironment)',
    nombra(nav, 'clasesDeLaBarra') && !nombra(codigo, 'activeEnvironment') && !nombra(codigo, 'setActiveEnvironment'));

  console.log('\n6) Lo que no cambia (invariantes)\n');
  invariante('el punto del entorno sigue junto a la campana',
    /<InsigniaEntorno entorno=\{entorno\} \/>\s*<CampanaAvisos \/>/.test(nav)
    && /import InsigniaEntorno from '@\/components\/ui\/insignia-entorno'/.test(codigo));
  invariante('y distingue los dos entornos',
    renderToStaticMarkup(h(InsigniaEntorno, { entorno: 'TEST' })) !== renderToStaticMarkup(h(InsigniaEntorno, { entorno: 'PROD' })));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
