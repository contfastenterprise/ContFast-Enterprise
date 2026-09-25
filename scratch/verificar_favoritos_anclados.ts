/**
 * Lote 191 -- los favoritos anclados del menu.
 *
 * DE DONDE SALE
 * -------------
 * Sugerencia 5 de las seis que se midieron el 2026-09-24, elegida por el dueño:
 * "una estrella junto a cada elemento, y los anclados arriba". El lote 189 hizo
 * que el scroll se vea y que lo que abres se recuerde; lo que de verdad convierte
 * 50 elementos en 5 es que cada uno se quede con los suyos.
 *
 * La medicion que lo justifica (PRODUCCION, 2026-09-24): `inventory_movements`
 * 476, `expenses` 113, `invoices` 88, `products` 87, `delivery_notes` 70, frente
 * a `employees` 1 y `credit_debit_notes` 0. El dia a dia son cinco o seis
 * pantallas de las cincuenta.
 *
 * LO QUE ESTE BANCO EJECUTA DE VERDAD
 * -----------------------------------
 * `utils/favoritosDelMenu` es puro y se importa, asi que las cuatro reglas se
 * ejecutan con datos. Del componente solo se puede leer el texto, y ahi se fija
 * la PROPIEDAD, no la linea: el lote 189 tuvo cuatro bancos rotos por anclar una
 * linea literal que luego cambio de forma sin cambiar de sentido.
 *
 * Y la leccion del 190, que es la razon de que exista `utils/favoritosDelMenu`:
 * un banco que reimplementa la regla para "ejecutarla" comprueba su propia copia
 * y sobrevive a cualquier mutante del codigo de verdad.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const SIDEBAR = 'src/components/ui/new-app-sidebar.tsx';

/** El cuerpo de una funcion, acotado por la siguiente declaracion de nivel superior. */
function bloque(src: string, desde: string, hasta: string): string {
  const i = src.indexOf(desde);
  if (i < 0) return '';
  const j = src.indexOf(hasta, i + desde.length);
  return src.slice(i, j > -1 ? j : src.length);
}

async function main() {
  const sb = leer(SIDEBAR);

  //  PRECONDICIONES. Tienen que valerse en los DOS estados -- antes y despues del
  //  lote --, o la contraprueba revienta en vez de fallar comprobacion a
  //  comprobacion. Las tres son ciertas desde antes del 191.
  if (sb === '') throw new Error('Precondicion: no esta el sidebar');
  if (!/function SidebarContent\(/.test(sb)) throw new Error('Precondicion: ya no existe SidebarContent');
  if (!/function NavItem\(/.test(sb)) throw new Error('Precondicion: ya no existe NavItem');
  if (!/function SearchModal\(/.test(sb)) throw new Error('Precondicion: ya no existe el buscador');
  //  DOS instancias de `SidebarContent` (escritorio y cajon movil). Es la razon de
  //  que el estado tenga que vivir en el padre, y ya era verdad antes del lote.
  const instancias = (sb.match(/<SidebarContent/g) || []).length;
  if (instancias !== 2) throw new Error(`Precondicion: se esperaban 2 <SidebarContent>, hay ${instancias}`);
  console.log('  pre   el sidebar, sus dos instancias, NavItem y el buscador siguen ahi');

  const codigo = sinComentarios(sb);
  const cuerpoNavItem = bloque(codigo, 'function NavItem(', 'function SearchModal(');
  const cuerpoBuscador = bloque(codigo, 'function SearchModal(', 'function SidebarContent(');
  const cuerpoContenido = bloque(codigo, 'function SidebarContent(', 'export default function NewAppSidebar');
  const cuerpoPadre = bloque(codigo, 'export default function NewAppSidebar', '\uffff FIN');
  for (const [n, c] of [['NavItem', cuerpoNavItem], ['SearchModal', cuerpoBuscador],
    ['SidebarContent', cuerpoContenido], ['NewAppSidebar', cuerpoPadre]] as const) {
    if (c === '') throw new Error(`Precondicion: no se acota el cuerpo de ${n}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La regla, EJECUTADA (la de verdad, importada)\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Perezoso: un `import` estatico de un modulo que este lote CREA hace reventar
  //  la contraprueba con "Cannot find module" en vez de dar FALLA por etiqueta.
  let M: typeof import('../src/utils/favoritosDelMenu') | null = null;
  try { M = await import('../src/utils/favoritosDelMenu'); } catch { M = null; }

  const ETIQUETAS = [
    'anclar añade al final, en el orden en que se ancla',
    'anclar lo ya anclado lo desancla',
    'no se toca la lista que se recibe (es estado de React)',
    'una ruta vacia no se ancla',
    'lo anclado sale en el orden de anclado, no alfabetico',
    'un ancla a una pantalla que ya no se ve se ignora',
    'una ruta con dos permisos sale UNA vez',
    'el buscador ofrece lo anclado primero',
    'y rellena hasta el tope con el principio del menu',
    'con mas anclas que huecos, el tope se respeta',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/favoritosDelMenu.ts');
  } else {
    const { alternarFavorito, esFavorito, favoritosVisibles, sugerenciasIniciales } = M;

    // ── alternarFavorito ──
    const vacio: string[] = [];
    const uno = alternarFavorito(vacio, '/dashboard/invoices');
    const dos = alternarFavorito(uno, '/dashboard/expenses');
    ok(ETIQUETAS[0],
      JSON.stringify(dos) === JSON.stringify(['/dashboard/invoices', '/dashboard/expenses']),
      JSON.stringify(dos));
    ok(ETIQUETAS[1],
      JSON.stringify(alternarFavorito(dos, '/dashboard/invoices')) === JSON.stringify(['/dashboard/expenses']));
    //  MUTAR LA LISTA NO REPINTA. Si `alternarFavorito` hiciera `push`, React veria
    //  la misma referencia y la estrella no cambiaria hasta el siguiente repintado
    //  por otra causa -- un defecto que se ve como "a veces no funciona".
    ok(ETIQUETAS[2], vacio.length === 0 && uno.length === 1);
    ok(ETIQUETAS[3], alternarFavorito(dos, '').length === 2);
    ok('  esFavorito dice si esta anclado',
      esFavorito(dos, '/dashboard/expenses') && !esFavorito(dos, '/dashboard/products'));

    // ── favoritosVisibles ──
    //  La forma real: lo que `buildSidebar` devuelve ya filtrado por permisos, con
    //  las DOS filas de `/dashboard/antiguedad-saldos` (medido en PRODUCCION:
    //  modulos `cobros` y `proveedores`, a proposito).
    const visibles = [
      { name: 'Inicio', href: '/dashboard', grupo: 'Principal' },
      { name: 'Facturación', href: '/dashboard/invoices', grupo: 'Ingresos' },
      { name: 'Productos', href: '/dashboard/products', grupo: 'Inventario' },
      { name: 'Antiguedad de Saldos', href: '/dashboard/antiguedad-saldos', grupo: 'Finanzas' },
      { name: 'Antiguedad de Saldos', href: '/dashboard/antiguedad-saldos', grupo: 'Finanzas' },
      { name: 'Gastos', href: '/dashboard/expenses', grupo: 'Egresos' },
    ];
    //  `/dashboard/documentos` es el modulo RETIRADO en el lote 100: un ancla
    //  guardada en el navegador le sobrevive.
    const anclas = ['/dashboard/expenses', '/dashboard/documentos', '/dashboard/invoices'];
    const anclados = favoritosVisibles(visibles, anclas);

    ok(ETIQUETAS[4],
      JSON.stringify(anclados.map(i => i.href)) === JSON.stringify(['/dashboard/expenses', '/dashboard/invoices']),
      JSON.stringify(anclados.map(i => i.href)));
    ok(ETIQUETAS[5], !anclados.some(i => i.href === '/dashboard/documentos'), `${anclados.length} anclados`);
    ok(ETIQUETAS[6],
      favoritosVisibles(visibles, ['/dashboard/antiguedad-saldos'])
        .filter(i => i.href === '/dashboard/antiguedad-saldos').length === 1);
    //  PERMISOS: lo que no esta en la lista visible no se enseña, aunque siga
    //  anclado. Un ancla a una pantalla sin permiso seria un enlace a un 403 en el
    //  sitio mas visible del menu.
    ok('  lo anclado sin permiso no se enseña',
      favoritosVisibles(visibles.filter(i => i.href !== '/dashboard/expenses'), anclas)
        .every(i => i.href !== '/dashboard/expenses'));
    ok('  sin anclas no hay nada que enseñar', favoritosVisibles(visibles, []).length === 0);
    ok('  el objeto que sale es el del menu, con su icono y su grupo',
      anclados[0]?.name === 'Gastos' && anclados[0]?.grupo === 'Egresos');

    // ── sugerenciasIniciales ──
    const sug = sugerenciasIniciales(visibles, ['/dashboard/expenses'], 3);
    ok(ETIQUETAS[7], sug[0]?.href === '/dashboard/expenses', JSON.stringify(sug.map(i => i.href)));
    ok(ETIQUETAS[8], sug.length === 3 && sug[1]?.href === '/dashboard' && sug[2]?.href === '/dashboard/invoices',
      JSON.stringify(sug.map(i => i.href)));
    ok('  y no repite lo que ya salio arriba',
      new Set(sug.map(i => i.href)).size === sug.length);
    ok(ETIQUETAS[9],
      sugerenciasIniciales(visibles, ['/dashboard/expenses', '/dashboard/invoices', '/dashboard/products'], 2)
        .length === 2);
    ok('  un tope de cero no devuelve nada', sugerenciasIniciales(visibles, anclas, 0).length === 0);
    ok('  sin anclas se comporta como antes: el principio del menu',
      JSON.stringify(sugerenciasIniciales(visibles, [], 2).map(i => i.href))
        === JSON.stringify(['/dashboard', '/dashboard/invoices']));
    ok('  una lista vacia no revienta', sugerenciasIniciales([], ['/x'], 5).length === 0);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) La estrella, donde se puede pulsar\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('cada elemento del menu puede anclarse', /onAnclar/.test(cuerpoNavItem));
  //  LA ESTRELLA NO VA DENTRO DEL ENLACE. Un `<button>` dentro de un `<a>` es HTML
  //  invalido, y lo que pasa de verdad es peor que un aviso del validador: el clic
  //  navega igual, porque el enlace es el ancestro y recibe el evento. Se comprueba
  //  la POSICION: el boton aparece despues de cerrarse el `<Link>`.
  const finDelEnlace = cuerpoNavItem.lastIndexOf('</Link>');
  const dondeElBoton = cuerpoNavItem.indexOf('onAnclar()');
  ok('el boton de anclar esta FUERA del <Link>, no anidado dentro',
    finDelEnlace > -1 && dondeElBoton > finDelEnlace,
    `</Link> en ${finDelEnlace}, boton en ${dondeElBoton}`);
  //  Y el clic no puede navegar ni cerrar el cajon del movil.
  ok('  anclar no navega (preventDefault) ni cierra el menu (stopPropagation)',
    /preventDefault\(\)/.test(cuerpoNavItem) && /stopPropagation\(\)/.test(cuerpoNavItem));
  ok('  la estrella anclada se ve siempre; la de anclar, al pasar por encima',
    /group-hover\/fila:opacity-100/.test(cuerpoNavItem) && /opacity-0/.test(cuerpoNavItem));
  ok('  y tambien con el teclado, sin raton', /focus-visible:opacity-100/.test(cuerpoNavItem));
  //  Con el menu plegado solo caben los iconos: una estrella encima seria una
  //  trampa para el dedo.
  ok('con el menu plegado no hay estrella', /!collapsed/.test(cuerpoNavItem)
    && /conEstrella/.test(cuerpoNavItem));
  ok('  y el nombre no se corta debajo de la estrella (hay hueco)',
    /conEstrella && 'pr-\d/.test(cuerpoNavItem));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Lo anclado, arriba y en las dos instancias\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('hay un bloque de anclados en el menu', /anclados\.map\(/.test(cuerpoContenido));
  ok('  cruzado con lo que esta persona puede ver',
    /favoritosVisibles\(/.test(cuerpoContenido));
  //  Una cabecera "Favoritos" sobre una lista vacia gastaria una de las filas que
  //  el lote quiere ahorrar.
  ok('  y no se pinta si no hay nada anclado', /anclados\.length > 0 &&/.test(cuerpoContenido));

  //  EL ELEMENTO ACTIVO SALE DOS VECES -- arriba y en su grupo -- y `refActivo` es
  //  UN solo ref: si lo llevaran los dos, el ultimo en pintarse ganaria y el
  //  `scrollIntoView` del lote 189 dejaria de traer a la vista la fila del grupo,
  //  que es la que puede estar debajo del pliegue.
  const bloqueAnclados = (() => {
    const i = cuerpoContenido.indexOf('anclados.length > 0 &&');
    if (i < 0) return '';
    const j = cuerpoContenido.indexOf('dynamicGroups.map(', i);
    return j > -1 ? cuerpoContenido.slice(i, j) : '';
  })();
  ok('la copia anclada no se pelea por el ref del elemento activo',
    bloqueAnclados !== '' && /<NavItem/.test(bloqueAnclados) && !/refActivo/.test(bloqueAnclados),
    bloqueAnclados === '' ? 'no se acota el bloque' : '');

  //  LAS DOS INSTANCIAS. Es el defecto que el 189 arreglo con los grupos: con el
  //  estado dentro de `SidebarContent`, anclar en el escritorio no existia en el
  //  movil.
  //  SE MIRA CADA INSTANCIA POR SEPARADO. Contar `favoritos={favoritos}` en todo
  //  el fichero no servia: el buscador tambien lo recibe, asi que el mutante que
  //  se lo quitaba al cajon movil seguia dando dos apariciones y SOBREVIVIA.
  const usos = [...codigo.matchAll(/<SidebarContent[\s\S]*?\/>/g)].map(m => m[0]);
  ok('las DOS instancias reciben lo anclado',
    usos.length === 2 && usos.every(u => /favoritos=\{favoritos\}/.test(u)),
    `${usos.filter(u => /favoritos=\{favoritos\}/.test(u)).length} de ${usos.length}`);
  ok('  y las dos pueden anclar',
    usos.length === 2 && usos.every(u => /alternarAnclado=\{alternarAnclado\}/.test(u)));
  //  LOTE 195: el estado sigue en el padre, pero ya no se crea con un `useState` a
  //  pelo: lo crea el hook que restaura la preferencia antes de pintar. La propiedad
  //  que importa no cambia -- UNA sola verdad para las dos instancias.
  ok('el estado vive en el padre, no en cada instancia',
    /usePreferenciaDelNavegador<string\[\]>\(/.test(cuerpoPadre)
    && !/usePreferenciaDelNavegador<string\[\]>\(/.test(cuerpoContenido));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Se recuerda, y no lanza nunca\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  LOTE 195: guardar y leer se fue a `hooks/usePreferenciaDelNavegador`, el mismo
  //  camino que los grupos abiertos, porque leer el navegador en el inicializador del
  //  `useState` rompia la hidratacion (lo reporto el dueño el 2026-09-25).
  //
  //  Aqui se queda la propiedad de ESTE lote: que lo anclado se recuerde, y con SU
  //  clave.
  ok('lo anclado se recuerda en el navegador',
    /CLAVE_FAVORITOS/.test(codigo)
    && /usePreferenciaDelNavegador<string\[\]>\(/.test(cuerpoPadre));
  //  Con su clave y no con la de los grupos: si las dos preferencias compartieran
  //  clave, abrir un grupo borraria las anclas.
  ok('  con su propia clave, no con la de los grupos abiertos',
    /CLAVE_FAVORITOS, VACIO_FAVORITOS/.test(cuerpoPadre)
    && /CLAVE_FAVORITOS = 'contfast:sidebar:favoritos'/.test(codigo));
  //  ESTA DECIA LO CONTRARIO Y SE INVIERTE: exigia leerlo en el inicializador "sin
  //  salto al repintar", que es exactamente el defecto que cerro el lote 195.
  ok('  y NO se lee el navegador mientras se pinta',
    !/useState<string\[\]>\([\s\S]{0,180}leerFavoritosGuardados/.test(cuerpoPadre)
    && /usePreferenciaDelNavegador/.test(cuerpoPadre));
  //  Que leer y guardar no lancen, y que lo guardado se valide, se comprueba ahora en
  //  `verificar_hidratacion_menu.ts` -- y alli se EJECUTA, porque la validacion vive
  //  en un modulo puro. Aqui solo se podia leer el texto del fichero: que la linea
  //  estuviera escrita, no que funcionara. Se apunta el traslado en vez de dejar el
  //  hueco sin explicacion.
  console.log('  (que no lance y que valide lo guardado: en verificar_hidratacion_menu.ts, ejecutado)');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) El buscador, con la caja vacia\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el buscador ofrece lo anclado antes que el principio del menu',
    /sugerenciasIniciales\(/.test(cuerpoBuscador));
  //  NEGACION ATADA A UNA MARCA POSITIVA: "ya no usa `slice(0, 7)`" es cierto de
  //  balde en cualquier fichero que no lo tuviera nunca.
  ok('  y ya no enseña los siete primeros en orden arbitrario',
    /sugerenciasIniciales\(/.test(cuerpoBuscador) && !/allItems\.slice\(/.test(cuerpoBuscador));
  ok('  el buscador sabe que esta anclado', /favoritos/.test(cuerpoBuscador));
  ok('  y lo dice, para que la lista no parezca otra vez arbitraria',
    /esFavorito\(favoritos,/.test(cuerpoBuscador));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Si algun dia se pide que lo anclado siga a la persona entre ordenadores, esto
  //  es la decision que habra que cambiar -- con tabla, migracion y ruta.
  ok('lo anclado NO va a la base de datos: es del navegador, como los grupos',
    !/whatsapp|api\/v1\/admin\/settings/.test(bloque(sb, 'DONDE SE GUARDA LO ANCLADO', 'interface AppSidebarProps'))
    && /del NAVEGADOR y no de la base/.test(sb));
  //  Se decidio anclar y NO "recientes": los recientes no se configuran, pero
  //  cambian solos y el menu se mueve debajo del raton.
  ok('y no hay "recientes": lo anclado no se mueve solo',
    !/reciente/i.test(codigo) && /ANCLAR Y NO "RECIENTES"/.test(leer('src/utils/favoritosDelMenu.ts')));
  //  Las anclas NO se limpian por lo que hoy no se ve: si el permiso vuelve, el
  //  ancla sigue ahi.
  ok('un ancla que hoy no se puede enseñar no se borra',
    /No se borra el ancla/.test(leer('src/utils/favoritosDelMenu.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
