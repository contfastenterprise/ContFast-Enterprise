/**
 * Lote 189 -- el sidebar deja de esconder lo que hay.
 *
 * LO QUE DIJO EL DUEÑO, Y LO QUE SE MIDIO
 * --------------------------------------
 * "quiero que el sidebar sea mas fluido, facil para el usuario al momento de
 * buscar y seleccionar" y, al preguntarle: "como esta tiende a ocultarse y hay
 * que hacer scroll para buscar y seleccionar".
 *
 * Medido en PRODUCCION (solo lectura): 50 elementos de menu en 9 grupos. Con
 * todo abierto son 59 filas, asi que el scroll es inevitable -- el problema no
 * era que hubiera scroll, sino que estaba a ciegas. Tres causas, las tres en el
 * codigo:
 *
 *  1. LA BARRA DE SCROLL ESTABA OCULTA A PROPOSITO
 *     (`[&::-webkit-scrollbar]:hidden`, `[scrollbar-width:none]`). Nada decia que
 *     hubiera mas abajo, ni donde estabas, ni habia barra que agarrar.
 *
 *  2. EL ELEMENTO ACTIVO NO SE TRAIA A LA VISTA. No habia un solo
 *     `scrollIntoView` en el fichero: si la pantalla en la que estabas caia
 *     debajo del pliegue, habia que buscarla a mano en cada navegacion.
 *
 *  3. LO QUE ABRIAS NO SE RECORDABA. `expandedGroups` era un `useState` sin
 *     persistencia DENTRO de `SidebarContent`, y hay DOS instancias -- escritorio
 *     y cajon movil --, asi que al recargar se plegaba todo menos el grupo
 *     actual, y el cajon del movil empezaba plegado cada vez que se abria. Eso es
 *     literalmente "tiende a ocultarse".
 *
 * Y el buscador (Ctrl+K) solo atendia `Escape`: escribias y habia que ir al
 * raton. Tampoco ignoraba tildes -- "facturacion" no encontraba "Facturacion"
 * con acento -- y en la derecha enseñaba la URL cruda en vez del grupo.
 *
 * DECISION DEL DUEÑO (2026-09-24): se RECUERDA lo que dejo abierto. No se abre
 * todo (59 filas), ni uno solo a la vez (obliga a cerrar para cambiar de area).
 *
 * La comparacion de texto se EJECUTA aqui; el resto se lee del codigo, porque es
 * una pantalla.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const SIDEBAR = 'src/components/ui/new-app-sidebar.tsx';
const BUSCAR = 'src/utils/buscarTexto.ts';

async function main() {
  const sb = leer(SIDEBAR);
  if (!/function SearchModal/.test(sb)) {
    throw new Error('Precondicion: el sidebar ya no tiene buscador');
  }
  if (!/metaKey \|\| e\.ctrlKey/.test(sb)) {
    throw new Error('Precondicion: se perdio el atajo de teclado que abre el buscador');
  }
  if (!/getAllSearchableItems/.test(sb)) {
    throw new Error('Precondicion: ya no se construye la lista de lo buscable');
  }
  //  Escape ya cerraba el buscador antes de este lote, asi que como comprobacion
  //  regalaba un OK en la contraprueba. Es una guarda de lo que el lote NO puede
  //  romper al añadir las flechas y Enter, y por eso va aqui.
  if (!/e\.key === 'Escape'/.test(sb)) {
    throw new Error('Precondicion: Escape ya no cierra el buscador');
  }
  console.log('  pre   el buscador, su atajo y la lista de lo buscable siguen en pie');

  const codigo = sinComentarios(sb);

  console.log('\n1) Buscar sin tildes, ejecutado\n');
  let B: typeof import('../src/utils/buscarTexto') | null = null;
  try { B = await import('../src/utils/buscarTexto'); } catch { B = null; }

  const ETIQUETAS = [
    'escribir sin tilde encuentra lo que la lleva',
    'y al reves tambien',
    'da igual mayusculas o minusculas',
    'la ñ se trata como n (quien busca jimenez encuentra JIMENEZ)',
    'una busqueda vacia no descarta nada',
    'busca en varios campos: nombre o grupo',
  ];

  if (!B) {
    for (const t of ETIQUETAS) falta(t, 'no existe utils/buscarTexto.ts');
  } else {
    const { sinTildes, coincide, coincideEnAlguno } = B;

    //  EL CASO QUE LO ORIGINA: nadie teclea la tilde cuando busca rapido.
    ok(ETIQUETAS[0], coincide('Facturación', 'facturacion'));
    ok(ETIQUETAS[1], coincide('Facturacion', 'facturación'));
    ok(ETIQUETAS[2], coincide('INVENTARIO', 'inven') && coincide('inventario', 'INVEN'));
    ok(ETIQUETAS[3], coincide('JIMÉNEZ', 'jimenez') && coincide('Niño', 'nino'));
    ok('  y las cinco vocales', sinTildes('áéíóú') === 'aeiou', sinTildes('áéíóú'));
    ok('  con dieresis tambien', coincide('Bilingüe', 'bilingue'));

    //  Vacio deja la lista entera: es lo que se ve antes de escribir nada.
    ok(ETIQUETAS[4], coincide('cualquier cosa', '') && coincide('x', null) && coincide('x', '   '));
    //  Y no encuentra lo que no esta.
    ok('  pero no encuentra lo que no esta', !coincide('Facturación', 'nomina'));
    ok('  ni con un texto vacio a la izquierda', !coincide('', 'algo') && !coincide(null, 'algo'));

    //  Buscar por grupo: quien escribe "finanzas" espera ver lo de Finanzas.
    ok(ETIQUETAS[5],
      coincideEnAlguno(['Cuentas por Cobrar', 'Finanzas'], 'finanzas')
      && coincideEnAlguno(['Cuentas por Cobrar', 'Finanzas'], 'cobrar')
      && !coincideEnAlguno(['Cuentas por Cobrar', 'Finanzas'], 'nomina'));
  }

  console.log('\n2) El scroll deja de ser a ciegas\n');
  //  LA CAUSA 1, en el sitio donde estaba.
  ok('la barra de scroll de la navegacion ya no se oculta',
    !/\[&::-webkit-scrollbar\]:hidden/.test(codigo) && !/\[scrollbar-width:none\]/.test(codigo));
  ok('  y usa la barra fina que ya usa el resto del fichero',
    /flex-1 overflow-y-auto custom-scrollbar/.test(codigo));

  //  LA CAUSA 2.
  ok('el elemento activo se trae a la vista',
    /refActivo\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\)/.test(codigo));
  ok('  al navegar y al abrir o cerrar un grupo',
    /\}, \[pathname, expandedGroups\]\)/.test(codigo));
  //  `nearest` y no `center`: centrar da un salto en cada navegacion. La negativa
  //  va ATADA al positivo: sola es cierta de balde antes del lote, cuando no habia
  //  ningun `scrollIntoView` que pudiera centrar nada.
  ok('  moviendo lo justo, sin saltos',
    /scrollIntoView\(\{ block: 'nearest' \}\)/.test(codigo) && !/block: 'center'/.test(codigo));
  //  La referencia tiene que llegar a TODOS los sitios donde se pinta un enlace,
  //  o el activo de un grupo se queda sin traer.
  const navItems = (codigo.match(/<NavItem/g) || []).length;
  const conRef = (codigo.match(/refActivo=\{refActivo\}/g) || []).length;
  ok('  y la lleva cada sitio donde se pinta un enlace',
    navItems > 0 && conRef === navItems, `${conRef} de ${navItems}`);
  ok('  solo el activo la recibe', /ref=\{isActive \? refActivo : undefined\}/.test(codigo));

  console.log('\n3) Lo que abres se recuerda, y es UNO para las dos instancias\n');
  //  LA CAUSA 3. El estado ya no vive dentro de `SidebarContent`.
  //  ACOTADO al cuerpo de `SidebarContent`. Sin el limite, la rebanada llega al
  //  final del fichero y caza el estado del PADRE -- que es justo donde tiene que
  //  estar ahora --, asi que la comprobacion fallaba sin que faltara nada. Es la
  //  misma trampa del `indexOf` sin acotar que este repositorio lleva anotada.
  const dentroDelContenido = (() => {
    const i = codigo.indexOf('function SidebarContent');
    if (i < 0) return '';
    const j = codigo.indexOf('export default function NewAppSidebar', i);
    return codigo.slice(i, j > -1 ? j : codigo.length);
  })();
  if (dentroDelContenido === '') throw new Error('Precondicion: no se encuentra SidebarContent');
  ok('SidebarContent ya no tiene su propio estado de grupos',
    !/const \[expandedGroups, setExpandedGroups\] = useState/.test(dentroDelContenido));
  ok('  lo recibe de fuera', /expandedGroups: Record<string, boolean>;/.test(codigo));
  //  Las DOS instancias: si una se queda sin el, vuelve a divergir.
  const instancias = (codigo.match(/<SidebarContent/g) || []).length;
  const conEstado = (codigo.match(/expandedGroups=\{expandedGroups\}/g) || []).length;
  ok('las dos instancias comparten el mismo estado',
    instancias === 2 && conEstado === 2, `${conEstado} de ${instancias}`);

  //  NO BASTA CON QUE LA FUNCION EXISTA: un mutante que quitaba la LLAMADA
  //  sobrevivio, porque `guardarGrupos` seguia ahi con su `setItem` dentro. Es la
  //  trampa de la mera presencia. Se exige tambien el efecto que la invoca.
  ok('se guarda en el navegador',
    /localStorage\.setItem\(CLAVE_GRUPOS/.test(codigo)
    && /useEffect\(\(\) => \{ guardarGrupos\(expandedGroups\); \}, \[expandedGroups\]\)/.test(codigo));
  ok('  y se lee al arrancar, no despues', /useState<Record<string, boolean>>\(\s*\(\) => \(typeof window/.test(codigo));
  //  Leerlo en un efecto pintaria primero lo plegado y lo corregiria despues: se
  //  veria como un salto.
  ok('leer una preferencia NUNCA puede romper el menu',
    /function leerGruposGuardados[\s\S]{0,900}catch \{\s*return null;/.test(codigo)
    && /function guardarGrupos[\s\S]{0,300}catch \{/.test(codigo));
  //  Basura en esa clave no puede colarse al estado.
  ok('  ni lo guardado con una forma que no es la esperada',
    /typeof v === 'boolean'/.test(codigo));

  //  Abrir NO es alternar: el grupo de la pagina actual se abre solo, y con
  //  `toggleGroup` se cerraria justo cuando ya estaba abierto.
  ok('abrir el grupo actual no lo cierra si ya estaba abierto',
    /const abrirGrupo = React\.useCallback\(\(title: string\) => \{\s*setExpandedGroups\(prev => \(prev\[title\] \? prev/.test(codigo));

  console.log('\n4) El buscador se maneja con el teclado\n');
  ok('las flechas mueven la seleccion',
    /e\.key === 'ArrowDown'/.test(codigo) && /e\.key === 'ArrowUp'/.test(codigo));
  ok('  dando la vuelta al llegar al extremo',
    /\(i \+ 1\) % results\.length/.test(codigo) && /\(i - 1 \+ results\.length\) % results\.length/.test(codigo));
  ok('Enter abre lo seleccionado', /e\.key === 'Enter'/.test(codigo) && /handleSelect\(elegido\.href\)/.test(codigo));
  //  (Escape ya cerraba antes del lote: es precondicion, no comprobacion. Ver
  //  arriba.)
  //  Si al cambiar lo escrito la seleccion se quedara donde estaba, Enter
  //  abriria algo que ya no se esta viendo.
  ok('al cambiar lo escrito la seleccion vuelve al primero',
    /useEffect\(\(\) => \{ setSeleccion\(0\); \}, \[query\]\)/.test(codigo));
  //  Raton y teclado sobre la MISMA seleccion, o lo resaltado y lo que abre Enter
  //  podrian ser distintos.
  ok('el raton mueve la misma seleccion que el teclado',
    /onMouseEnter=\{\(\) => setSeleccion\(i\)\}/.test(codigo));
  ok('se dice que el teclado sirve', /moverse/.test(codigo) && /abrir/.test(codigo));

  console.log('\n5) El buscador usa la regla, y dice donde esta cada cosa\n');
  ok('filtra con el ayudante, no con includes a pelo',
    /coincideEnAlguno\(\[i\.name, i\.grupo\], query\)/.test(codigo)
    && !/name\.toLowerCase\(\)\.includes/.test(codigo));
  ok('  importandolo', /from '@\/utils\/buscarTexto'/.test(sb));
  //  La URL no le dice nada a quien busca; el grupo si.
  ok('enseña el GRUPO, no la URL',
    /\{item\.grupo\}/.test(codigo) && !/\{item\.href\}\s*<\/span>/.test(codigo));
  ok('  y el grupo viaja con cada elemento', /grupo: g\.title/.test(codigo));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
