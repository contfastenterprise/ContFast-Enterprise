/**
 * Lote 193 -- el selector de empresa, en la cabecera.
 *
 * DE DONDE SALE
 * -------------
 * Pedido del dueño (2026-09-25): *"el selector de empresa que esta en el sidebar
 * ponlo en el header y quita el nombre de la empresa del header para solo usar el
 * selector. tambien el simbolo de produccion que esta al lado de la campana de
 * notificacion ponlo del aldo izquierdo y no lo separes tanto"*.
 *
 * (Lo del punto del entorno se vigila en `verificar_entorno_y_sesion.ts`, que es
 * donde vive esa comprobacion desde el lote 192; alli se re-anclo a la ADYACENCIA
 * en vez de al orden, porque exigir "despues de la campana" era fijar la forma.)
 *
 * LO QUE HABIA, MEDIDO
 * --------------------
 *  · El nombre de la empresa estaba DOS VECES: en texto plano en la cabecera y
 *    dentro del selector, en el pie del menu lateral.
 *  · El sitio donde se cambia era el que menos se ve, y **con el menu plegado
 *    desaparecia**: quedaba un cuadrito con la inicial, sin `onClick`.
 *  · PRODUCCION (2026-09-25): de 9 usuarios, 6 son `administracion` y **solo 1 es
 *    `sistemas`**. Para esos 6 el selector nunca fue un selector: es el nombre de
 *    la empresa. Asi que moverlo no les cambia nada, y al unico que puede cambiar
 *    le pone el mando delante.
 *  · Los nombres de rol estan TODOS en minusculas ('sistemas', 'administracion',
 *    'facturacion', 'compras'...). Por eso la comparacion estricta se conserva y
 *    este lote **no cambia quien puede cambiar de empresa**.
 *
 * La regla (quien puede, y la inicial del distintivo) vive en
 * `utils/cambioDeEmpresa.ts` y aqui se EJECUTA.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const LAYOUT = 'src/app/dashboard/ClientLayout.tsx';
const SIDEBAR = 'src/components/ui/new-app-sidebar.tsx';
const SELECTOR = 'src/components/ui/selector-de-empresa.tsx';

async function main() {
  const layout = leer(LAYOUT);
  const sidebar = leer(SIDEBAR);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (layout === '') throw new Error('Precondicion: no esta ClientLayout');
  if (sidebar === '') throw new Error('Precondicion: no esta el sidebar');
  if (!/handleSwitchCompany/.test(layout)) throw new Error('Precondicion: ya no existe handleSwitchCompany');
  if (!/<NewAppSidebar/.test(layout)) throw new Error('Precondicion: la cabecera ya no monta el sidebar');
  //  La lista de empresas la carga el layout; si dejara de cargarla, el selector no
  //  tendria nada que ofrecer y este banco estaria vigilando una cascara.
  if (!/setCompanies\(/.test(layout)) throw new Error('Precondicion: el layout ya no carga las empresas');
  //  `entorno` SE QUEDA en el sidebar aunque su rotulo se fuera en el lote 192: con
  //  el se calcula el hueco de la franja de PRUEBA, y sin el el menu se mete debajo.
  //  Va de PRECONDICION porque ya era verdad antes de este lote: como comprobacion
  //  sobrevivia a la contraprueba y no comprobaba nada de aqui.
  if (!/entorno=\{entorno\}/.test(layout) || !/entorno !== 'PROD'/.test(sidebar)) {
    throw new Error('Precondicion: el sidebar ya no recibe el entorno para el hueco de la franja');
  }
  console.log('  pre   el layout carga empresas, cambia de empresa, monta el sidebar y le da el entorno');

  const codigoLayout = sinComentarios(layout);
  const codigoSidebar = sinComentarios(sidebar);
  const selector = leer(SELECTOR);
  const codigoSelector = sinComentarios(selector);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La regla, EJECUTADA\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/utils/cambioDeEmpresa') | null = null;
  try { M = await import('../src/utils/cambioDeEmpresa'); } catch { M = null; }

  const ETIQUETAS = [
    'solo sistemas puede cambiar de empresa',
    'los demas roles reales de produccion, no',
    'sin rol tampoco (ni nulo ni indefinido)',
    'el distintivo no sale en blanco mientras no hay nombre',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/cambioDeEmpresa.ts');
  } else {
    const { puedeCambiarDeEmpresa, inicialDeEmpresa } = M;

    ok(ETIQUETAS[0], puedeCambiarDeEmpresa('sistemas') === true);
    //  Los roles de verdad, medidos en PRODUCCION el 2026-09-25.
    const OTROS = ['administracion', 'facturacion', 'compras', 'banco',
      'recursos_humanos', 'contabilidad', 'cajero'];
    ok(ETIQUETAS[1], OTROS.every(r => puedeCambiarDeEmpresa(r) === false),
      OTROS.filter(r => puedeCambiarDeEmpresa(r)).join(', ') || 'ninguno puede');
    ok(ETIQUETAS[2],
      puedeCambiarDeEmpresa(null) === false && puedeCambiarDeEmpresa(undefined) === false
      && puedeCambiarDeEmpresa('') === false);
    //  ANOTADO A PROPOSITO: hoy ningun rol se llama 'sistema' ni 'Sistemas', asi que
    //  la comparacion estricta es correcta y este lote NO la amplia -- eso cambiaria
    //  quien puede cambiar de empresa sin que nadie lo pida. Si algun dia aparece,
    //  este es el unico sitio a tocar, y esta comprobacion dira lo que hay hoy.
    ok('  y hoy no entra por variantes del nombre (medido: no existen)',
      puedeCambiarDeEmpresa('Sistemas') === false && puedeCambiarDeEmpresa('sistema') === false);

    //  `companyName.charAt(0).toUpperCase()` -- lo que habia -- daba CADENA VACIA
    //  mientras los ajustes no han llegado: un circulo en blanco en la cabecera, que
    //  es lo primero que hay al lado del logo.
    ok(ETIQUETAS[3],
      inicialDeEmpresa('') !== '' && inicialDeEmpresa(null) !== ''
      && inicialDeEmpresa(undefined) !== '' && inicialDeEmpresa('   ') !== '',
      JSON.stringify(inicialDeEmpresa('')));
    ok('  y con nombre da su inicial en mayuscula, saltando los espacios',
      inicialDeEmpresa('Latin Doors') === 'L' && inicialDeEmpresa('  artalum') === 'A');
    const fuente = leer('src/utils/cambioDeEmpresa.ts');
    ok('  la regla no arrastra React ni el navegador',
      fuente !== '' && !/^import /m.test(fuente) && !/window\.|localStorage/.test(fuente));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El selector, en la cabecera y en lugar del nombre\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('la cabecera monta el selector de empresa',
    /<SelectorDeEmpresa/.test(codigoLayout)
    && /from '@\/components\/ui\/selector-de-empresa'/.test(layout));
  //  EN LA CABECERA, no en cualquier parte: entre el logo y el grupo de la derecha.
  //  Se mira que caiga dentro del `<nav>`.
  const barra = (() => {
    const i = codigoLayout.indexOf('<nav');
    const j = codigoLayout.indexOf('</nav>', i);
    return i > -1 && j > i ? codigoLayout.slice(i, j) : '';
  })();
  if (barra === '') throw new Error('Precondicion: no se acota la barra de arriba');
  ok('  dentro de la barra de arriba', /<SelectorDeEmpresa/.test(barra));
  //  EL NOMBRE YA NO ESTA DOS VECES. La negativa va ATADA al positivo: sin selector
  //  seria cierta de balde en cualquier fichero que no tuviera el nombre.
  ok('el nombre suelto de la empresa se retira de la cabecera',
    /<SelectorDeEmpresa/.test(barra) && !/\{switching \? '' : companyName\}/.test(barra));
  ok('  y el selector recibe el nombre, las empresas y el rol de verdad',
    /companyName=\{companyName\}/.test(codigoLayout)
    && /companies=\{companies\}/.test(codigoLayout)
    && /rol=\{user\?\.role\}/.test(codigoLayout));
  //  MERA PRESENCIA: que el selector este no basta; cambiar de empresa tiene que
  //  llamar a la funcion que lo hace de verdad.
  //
  //  ACOTADO AL ELEMENTO DEL SELECTOR. Buscarlo en el fichero entero sobrevivia a la
  //  contraprueba, y con razon: antes de este lote ese mismo `onSwitchCompany=
  //  {handleSwitchCompany}` existia -- se le pasaba al SIDEBAR. Comprobaba que
  //  alguien lo recibiera, no que lo recibiera el selector.
  const montajeDelSelector = (() => {
    const i = codigoLayout.indexOf('<SelectorDeEmpresa');
    if (i < 0) return '';
    const j = codigoLayout.indexOf('/>', i);
    return j > -1 ? codigoLayout.slice(i, j) : '';
  })();
  ok('  y cambiar de empresa sigue enchufado a handleSwitchCompany',
    montajeDelSelector !== '' && /onSwitchCompany=\{handleSwitchCompany\}/.test(montajeDelSelector),
    montajeDelSelector === '' ? 'no se monta el selector' : '');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Lo que el selector no puede perder al mudarse\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  EL NOMBRE, COMPLETO (pedido del dueño el 2026-09-25, despues de ver la primera
  //  version). Se recortaba con puntos suspensivos a 110/200 px, y "LATIN DOORS
  //  S.R.L." quedaba en "LATIN DOO...": con seis empresas, el nombre a medias no
  //  dice en cual estas -- y es el dato que evita emitir una factura en la empresa
  //  equivocada. La negativa va ATADA al positivo (que el nombre se pinte), o seria
  //  cierta de balde en un fichero sin nombre ninguno.
  const nombreEnElSelector = (() => {
    const i = codigoSelector.indexOf("{switching ? '' : companyName}");
    if (i < 0) return '';
    const j = codigoSelector.lastIndexOf('<span', i);
    return j > -1 ? codigoSelector.slice(j, i) : '';
  })();
  ok('el nombre de la empresa se enseña COMPLETO, sin recortar',
    nombreEnElSelector !== '' && !/truncate/.test(nombreEnElSelector)
    && !/max-w-/.test(nombreEnElSelector),
    nombreEnElSelector === '' ? 'no se encuentra el nombre en el selector' : '');
  //  Y que no se parta en dos lineas dentro de una barra de 56 px de alto.
  ok('  y en una sola linea', /whitespace-nowrap/.test(nombreEnElSelector));

  ok('cada empresa sigue diciendo su RNC', /RNC:/.test(codigoSelector));
  ok('  la activa se sigue distinguiendo', /companyId === c\.id/.test(codigoSelector));
  ok('  y se sigue viendo que el cambio esta en marcha',
    /switching/.test(codigoSelector) && /animate-spin/.test(codigoSelector));
  //  QUIEN NO PUEDE CAMBIAR NO VE UN BOTON: es el defecto del avatar del lote 192
  //  (un clic que no hacia nada), que no se repite aqui.
  //  ACOTADO A LA RAMA. `/if \(!sePuede\)/` en todo el fichero SOBREVIVIO al mutante
  //  que vaciaba la guarda: el `useEffect` que cierra el menu al perder el permiso
  //  lleva ese mismo texto, asi que la comprobacion miraba otra linea. Lo que importa
  //  es que esa rama devuelva algo SIN boton.
  const ramaSinPermiso = (() => {
    const i = codigoSelector.indexOf('if (!sePuede) {');
    if (i < 0) return '';
    //  Hasta el cierre de la rama: la primera llave sola con dos espacios de
    //  sangria. Con una expresion regular y no buscando un salto de linea escrito
    //  a mano, que es lo que me revento el banco al editarlo.
    const resto = codigoSelector.slice(i);
    const fin = resto.search(/\n {2}\}/);
    return fin > -1 ? resto.slice(0, fin) : resto;
  })();
  ok('quien no puede cambiar no ve un boton que no hace nada',
    ramaSinPermiso !== '' && /return \(/.test(ramaSinPermiso) && !/<button/.test(ramaSinPermiso),
    ramaSinPermiso === '' ? 'no hay rama para quien no puede cambiar' : '');
  ok('  y la decision sale de la regla, no escrita en el componente',
    /puedeCambiarDeEmpresa\(rol\)/.test(codigoSelector) && !/=== 'sistemas'/.test(codigoSelector));
  ok('se puede salir sin elegir: Escape y pulsando fuera',
    /'Escape'/.test(codigoSelector) && /fixed inset-0/.test(codigoSelector));
  ok('  y el oyente de Escape no se queda puesto con el menu cerrado',
    /if \(!abierto\) return;/.test(codigoSelector));
  //  Si alguien deja de poder cambiar con el menu abierto, el menu se quedaria
  //  flotando sobre la pantalla.
  ok('  el menu no se queda abierto si se pierde el permiso',
    /if \(!sePuede\) setAbierto\(false\)/.test(codigoSelector));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) El sidebar se queda sin lo que ya no es suyo\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el sidebar ya no lleva el selector de empresa',
    /<SelectorDeEmpresa/.test(codigoLayout) && !/WorkspaceSwitcher/.test(codigoSidebar));
  //  Las propiedades que se quedan sin uso no se dejan colgando: un `companies` que
  //  nadie lee hace creer que el menu sigue teniendo el selector.
  ok('  ni las propiedades que eran solo del selector',
    !/companies/.test(codigoSidebar) && !/onSwitchCompany/.test(codigoSidebar)
    && !/companyName/.test(codigoSidebar) && !/switching/.test(codigoSidebar));
  //  ACOTADO AL PROPIO ELEMENTO. La primera version buscaba en todo el fichero, y
  //  ahi `companies={companies}` SIGUE estando -- ahora se lo pasa al selector --,
  //  asi que la negacion no decia nada (y su `|` mal puesto la hacia siempre cierta).
  //  Lo que importa es que el SIDEBAR ya no las reciba.
  const montajeDelSidebar = (() => {
    const i = codigoLayout.indexOf('<NewAppSidebar');
    if (i < 0) return '';
    const j = codigoLayout.indexOf('/>', i);
    return j > -1 ? codigoLayout.slice(i, j) : '';
  })();
  if (montajeDelSidebar === '') throw new Error('Precondicion: no se acota el montaje del sidebar');
  ok('  y la cabecera ya no se las pasa',
    !/companies|companyName|onSwitchCompany|switching|user=/.test(montajeDelSidebar),
    JSON.stringify(montajeDelSidebar.replace(/\s+/g, ' ').slice(0, 90)));


  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Medido: no existe ningun rol 'sistema' ni con mayusculas, asi que ampliar la
  //  comparacion seria cambiar QUIEN puede cambiar de empresa sin que se pida.
  ok('no cambia quien puede cambiar de empresa: sigue siendo solo sistemas',
    /rol === 'sistemas'/.test(leer('src/utils/cambioDeEmpresa.ts')));
  //  El panel de diagnostico comparaba el rol del PROP con el del contexto; al irse
  //  la propiedad `user` ya no hay dos fuentes, asi que la linea se retira en vez de
  //  inventarle una que diria siempre lo mismo que la de arriba.
  ok('el diagnostico no finge comparar dos fuentes cuando solo queda una',
    !/Rol Prop/.test(codigoSidebar) && /Rol Client/.test(codigoSidebar));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
