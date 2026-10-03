/**
 * LOTE 259 — la fila activa del menu: centrada, un poco mas grande, y con un fondo
 * que viaja de una fila a otra ("shared element").
 *
 * Pedido del dueño el 2026-10-03, despues de compararlo en una maqueta: centrada
 * (frente a "arriba" y a como estaba) y con escala.
 *
 * QUE SE COMPRUEBA
 * ----------------
 *  1. Las reglas, EJECUTADAS (`utils/filaActivaDelMenu`): que fila es la activa,
 *     cuanto se desplaza la lista, como, cuando, y cuanto crece la fila.
 *  2. Que el menu las use, y las tres trampas del mecanismo: dos menus montados a
 *     la vez, la pantalla activa en dos secciones, y una lista que se desplaza.
 *  3. El centrado: solo al navegar, solo la lista, y otra vez si un grupo crece.
 *
 * UN DEFECTO QUE SALIO AL MEDIRLO EN EL NAVEGADOR: en `/dashboard/hr/employees`
 * se iluminaban DOS filas ("Dashboard RRHH" y "Empleados"), porque cada fila
 * decidia sola con `pathname.startsWith(item.href)`. Con el fondo que viaja son dos
 * piezas con el mismo `layoutId`. Ahora decide el menu entero, y gana UNA.
 *
 * Se ejecuta con: npx tsx scratch/verificar_menu_activo_centrado.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => {
  const p = resolve(raiz, r);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};
//  Sin comentarios: los de este repositorio explican mucho, y una comprobacion que
//  lee la prosa pasa aunque el codigo diga otra cosa (lote 198 y siguientes).
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  comprobadas++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
/** Una comprobacion que LANZA cuenta como FALLA, no aborta el banco (lote 195). */
const intenta = (t: string, f: () => boolean) => {
  try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
};
/** Trozo de `src` entre `desde` y el siguiente `hasta` (acotar, no buscar en todo). */
const bloque = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  if (i < 0) return '';
  const j = src.indexOf(hasta, i + desde.length);
  return j > -1 ? src.slice(i, j) : '';
};

const SIDEBAR = 'src/components/ui/new-app-sidebar.tsx';
const REGLA = 'src/utils/filaActivaDelMenu.ts';

const ETIQUETAS_REGLA = [
  'en una ruta hija se ilumina UNA fila: la mas especifica',
  'la ruta exacta gana a su padre',
  'Inicio (/dashboard) solo coincide consigo mismo',
  'coincidir exige la barra: /dashboard/bank no es /dashboard/banks',
  'una pagina debajo de una ruta del menu la activa (/products/new)',
  'una pantalla fuera del menu no activa ninguna',
  'la lista se desplaza para dejar la fila en el CENTRO',
  '  acotado arriba: las primeras filas no se pueden centrar del todo',
  '  acotado abajo: las ultimas tampoco',
  '  y con todo a la vista no se desplaza nada',
  'el desplazamiento es suave al navegar',
  '  y sin animacion la primera vez y con "reducir movimiento"',
  'se centra al cambiar de pantalla, no al volver a correr en la misma',
  'la fila activa crece un 4,5 % y las demas no llevan transform',
  '  sin pasar del tope que recorta la lista (1,05)',
  'favoritos y grupos tienen cada uno su indicador',
];

async function main() {
  const sb = leer(SIDEBAR);
  //  PRECONDICIONES, ciertas en los DOS estados (antes y despues del lote).
  if (sb === '') throw new Error('Precondicion: no esta el sidebar');
  if ((sb.match(/<SidebarContent/g) || []).length !== 2) {
    throw new Error('Precondicion: se esperaban las dos instancias del menu (escritorio y movil)');
  }
  if (!/function NavItem\(/.test(sb)) throw new Error('Precondicion: ya no existe NavItem');
  console.log('  pre   el sidebar, sus dos instancias y NavItem siguen ahi');

  const codigo = sinComentarios(sb);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Las reglas, ejecutadas\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Import PEREZOSO: el modulo lo crea este lote, y un import estatico haria
  //  reventar la contraprueba con "Cannot find module" en vez de fallar etiqueta a
  //  etiqueta (seccion 3 del traspaso).
  let r: typeof import('../src/utils/filaActivaDelMenu') | null = null;
  if (existsSync(resolve(raiz, REGLA))) {
    r = await import('../src/utils/filaActivaDelMenu');
  }
  if (!r) {
    for (const e of ETIQUETAS_REGLA) ok(e, false, 'no existe utils/filaActivaDelMenu');
  } else {
    const R = r;
    const MENU = ['/dashboard', '/dashboard/hr', '/dashboard/hr/employees', '/dashboard/products', '/dashboard/bank'];
    intenta(ETIQUETAS_REGLA[0], () => R.filaActiva(MENU, '/dashboard/hr/employees') === '/dashboard/hr/employees');
    intenta(ETIQUETAS_REGLA[1], () => R.filaActiva(MENU, '/dashboard/hr') === '/dashboard/hr');
    intenta(ETIQUETAS_REGLA[2], () =>
      R.filaActiva(MENU, '/dashboard') === '/dashboard'
      && R.filaActiva(['/dashboard'], '/dashboard/invoices') === null);
    intenta(ETIQUETAS_REGLA[3], () =>
      R.filaActiva(MENU, '/dashboard/banks') === null
      && R.filaActiva(MENU, '/dashboard/bank/123') === '/dashboard/bank');
    intenta(ETIQUETAS_REGLA[4], () => R.filaActiva(MENU, '/dashboard/products/new') === '/dashboard/products');
    intenta(ETIQUETAS_REGLA[5], () => R.filaActiva(MENU, '/prueba') === null);

    //  Una fila de 36 px a 500 px del principio, en una vista de 600 y un contenido
    //  de 1.500: su centro (518) tiene que quedar en el centro de la vista (300).
    intenta(ETIQUETAS_REGLA[6], () =>
      R.desplazamientoParaCentrar({ filaArriba: 500, filaAlto: 36, vista: 600, contenido: 1500 }) === 218);
    intenta(ETIQUETAS_REGLA[7], () =>
      R.desplazamientoParaCentrar({ filaArriba: 50, filaAlto: 36, vista: 600, contenido: 1500 }) === 0);
    intenta(ETIQUETAS_REGLA[8], () =>
      R.desplazamientoParaCentrar({ filaArriba: 1450, filaAlto: 36, vista: 600, contenido: 1500 }) === 900);
    intenta(ETIQUETAS_REGLA[9], () =>
      R.desplazamientoParaCentrar({ filaArriba: 300, filaAlto: 36, vista: 600, contenido: 500 }) === 0);

    intenta(ETIQUETAS_REGLA[10], () => R.comoDesplazar(false, false) === 'smooth');
    intenta(ETIQUETAS_REGLA[11], () =>
      R.comoDesplazar(false, true) === 'auto' && R.comoDesplazar(true, false) === 'auto');
    intenta(ETIQUETAS_REGLA[12], () =>
      R.hayQueCentrar(null, '/a') && R.hayQueCentrar('/a', '/b') && !R.hayQueCentrar('/a', '/a'));
    intenta(ETIQUETAS_REGLA[13], () =>
      R.escalaDeLaFila(true) === 'scale(1.045)' && R.escalaDeLaFila(false) === undefined);
    intenta(ETIQUETAS_REGLA[14], () =>
      R.ESCALA_DE_LA_FILA_ACTIVA > 1 && R.ESCALA_DE_LA_FILA_ACTIVA <= 1.05);
    intenta(ETIQUETAS_REGLA[15], () => R.idDelIndicador('favoritos') !== R.idDelIndicador('grupos'));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El menu las usa, y las trampas del mecanismo\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  El import y el USO por separado, y el import anclado en el especificador con
  //  sus comillas (la trampa del `includes()` de la seccion 3 del traspaso).
  const importa = (nombre: string) =>
    new RegExp(`import \\{[^}]*\\b${nombre}\\b[^}]*\\} from '@/utils/filaActivaDelMenu'`).test(codigo);
  const usa = (nombre: string) => new RegExp(`\\b${nombre}\\(`).test(codigo);

  //  Acotado hasta la siguiente FUNCION, no hasta el comentario que la separa:
  //  `codigo` ya no tiene comentarios, y un bloque acotado por uno sale vacio.
  const navItem = bloque(codigo, 'function NavItem(', 'function SearchModal(');
  if (navItem === '') throw new Error('Precondicion: no se acota NavItem');
  const contenido = bloque(codigo, 'function SidebarContent(', 'export default function NewAppSidebar');
  const principal = codigo.slice(Math.max(0, codigo.indexOf('export default function NewAppSidebar')));

  //  EL FONDO QUE VIAJA. Que exista un `motion.span` con `layoutId` no basta: tiene
  //  que pintarse SOLO en la fila activa (si no, cincuenta piezas con el mismo id) y
  //  llevar el fondo azul, que es lo que se ve viajar.
  ok('la fila activa pinta un fondo con layoutId, solo ella',
    importa('idDelIndicador')
    && /\{isActive && \(\s*<m\.span\s+layoutId=\{idDelIndicador\(seccion\)\}/.test(navItem));
  const indicador = bloque(navItem, '<m.span', '</m.span>');
  ok('  y el fondo azul es del indicador, no de la fila',
    /bg-\[#003366\]/.test(indicador)
    && /isActive\s*\?\s*'text-white[^']*'/.test(navItem)
    && !/isActive\s*\?\s*'[^']*bg-\[#003366\][^']*'/.test(navItem));

  //  DOS SECCIONES: la pantalla anclada sale en Favoritos y en su grupo a la vez.
  const anclados = bloque(contenido, 'anclados.length > 0 &&', 'dynamicGroups.map(');
  const grupos = contenido.slice(Math.max(0, contenido.indexOf('dynamicGroups.map(')));
  const enGrupos = (grupos.match(/<NavItem/g) || []).length;
  ok('Favoritos usa SU indicador',
    /<NavItem[^>]*seccion="favoritos"/.test(anclados) && !/seccion="grupos"/.test(anclados));
  ok('  y cada fila de los grupos el de los grupos',
    enGrupos > 0 && (grupos.match(/seccion="grupos"/g) || []).length === enGrupos,
    `${(grupos.match(/seccion="grupos"/g) || []).length} de ${enGrupos}`);

  //  DOS MENUS MONTADOS A LA VEZ (escritorio y cajon del movil): cada uno en su
  //  `LayoutGroup`, o el fondo podria saltar de uno al otro.
  ok('cada menu separa sus indicadores (LayoutGroup por instancia)',
    /<LayoutGroup id=\{instancia\}>/.test(contenido)
    && /instancia="escritorio"/.test(principal) && /instancia="movil"/.test(principal));

  //  UNA LISTA QUE SE DESPLAZA: sin `layoutScroll` el fondo saldria desde donde
  //  estaba la fila ANTES de desplazarse.
  ok('la lista avisa de su desplazamiento al que mide (layoutScroll)',
    /<m\.nav\s+ref=\{refLista\}\s+layoutScroll/.test(contenido));
  //  `m` sin `LazyMotion` alrededor no anima nada (y en modo estricto lanza), y con
  //  `domAnimation` no hay animaciones de `layout`: el fondo no viajaria.
  ok('framer-motion se carga por partes, con las funciones de layout',
    /import \{[^}]*\bLazyMotion\b[^}]*\bdomMax\b[^}]*\} from 'framer-motion'/.test(codigo)
    && /<LazyMotion features=\{domMax\}>/.test(principal) && !/<motion\./.test(codigo));

  ok('la fila activa crece con la regla, y su estrella con ella',
    importa('escalaDeLaFila') && /escalaDeLaFila\(isActive\)/.test(navItem)
    && /<div className=\{clsx\('relative group\/fila', escala\.clase\)\} style=\{escala\.style\}>/.test(navItem));
  ok('"reducir movimiento" se respeta en las animaciones del menu',
    /<MotionConfig reducedMotion="user">/.test(principal)
    && /motion-reduce:transition-none/.test(navItem));

  //  UNA SOLA FILA ACTIVA. La negativa va atada al uso de la regla: sola seria
  //  cierta de balde en un menu sin filas.
  const filas = (contenido.match(/<NavItem/g) || []).length;
  ok('una sola fila activa para todo el menu',
    importa('filaActiva') && usa('filaActiva')
    && (contenido.match(/activa=\{item\.href === rutaActiva\}/g) || []).length === filas
    && !/pathname\.startsWith\(item\.href\)/.test(codigo),
    `${(contenido.match(/activa=\{item\.href === rutaActiva\}/g) || []).length} de ${filas}`);
  ok('  y el grupo en negrita y el que se abre solo dicen lo mismo',
    /const isGroupActive = visible\.some\(item => item\.href === rutaActiva\)/.test(contenido)
    && /g\.items\.some\(item => item\.href === rutaActiva\)/.test(contenido));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) El centrado\n');
  // ───────────────────────────────────────────────────────────────────────────
  const efecto = bloque(contenido, 'const centradaEn', 'const refsDeGrupo');
  ok('se centra midiendo la lista, no con scrollIntoView',
    importa('desplazamientoParaCentrar') && /lista\.scrollTo\(\{\s*top: desplazamientoParaCentrar\(/.test(efecto)
    && !/refActivo\.current\?\.scrollIntoView/.test(codigo));
  ok('  solo cuando cambia la pantalla (cerrar un grupo no mueve el menu)',
    importa('hayQueCentrar') && /if \(!lista \|\| !fila \|\| !hayQueCentrar\(centradaEn\.current, pathname\)\) return;/.test(efecto)
    && /centradaEn\.current = pathname;/.test(efecto));
  ok('  suave, salvo la primera vez y con "reducir movimiento"',
    importa('comoDesplazar') && /comoDesplazar\(!!reducirMovimiento, primeraVez\)/.test(efecto)
    && /const reducirMovimiento = useReducedMotion\(\);/.test(contenido));
  //  Al cargar se despliegan a la vez los grupos guardados, y uno que crece por
  //  ENCIMA de la fila la empuja despues de centrarla: medido, la fila acababa a
  //  765 px con la lista arriba del todo.
  ok('  y otra vez si CUALQUIER grupo esta creciendo, no solo el suyo',
    /lista\.querySelectorAll<HTMLElement>\('\[data-submenu\]'\)/.test(efecto)
    && /\.some\(s => s\.clientHeight < s\.scrollHeight\)/.test(efecto)
    && /window\.setTimeout\(\(\) => centrar\(comportamiento\), 300\)/.test(efecto)
    && /data-submenu=""/.test(contenido));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`} (${comprobadas} comprobaciones)\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
