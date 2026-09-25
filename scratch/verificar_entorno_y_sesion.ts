/**
 * Lote 192 -- el entorno al lado de la campana, y cerrar sesion dentro del avatar.
 *
 * DE DONDE SALE
 * -------------
 * Pedido del dueño (2026-09-24): *"el boton de cerrar seccion ponlo dentro de la
 * imajen del usuario, y la leyenda de produccion o prueva ponlo al lado de la
 * campana de notificacion pero sin el lebel pero si con hover"*.
 *
 * LO QUE SALIO AL MEDIR, y que no se pedia
 * ----------------------------------------
 *  1. El mismo dato se enseñaba TRES veces en PRUEBA (la franja rayada de arriba,
 *     una pastilla "SANDBOX" al lado de la campana y el pie del menu) y UNA sola
 *     en PRODUCCION (solo el pie del menu). La pastilla era la version con
 *     etiqueta del punto nuevo, asi que se retira con el bloque del menu; la
 *     franja SE QUEDA, porque dice que las operaciones son fiscalmente nulas.
 *  2. `entorno` y `activeEnvironment` son el MISMO valor: `ClientLayout` los fija
 *     en la misma vuelta desde `initialSettings.dgiiEnv`. Y 'CERT' es una rama
 *     muerta: todo lo que no es PRODUCCION cae en PRUEBA.
 *  3. El avatar llevaba `cursor-pointer` y `hover:scale-105` **sin un solo
 *     `onClick`**: prometia un clic que no hacia nada.
 *
 * La regla (que texto y que color le toca a cada entorno) vive en
 * `utils/entornoVisible.ts` y aqui se EJECUTA. De los componentes solo se puede
 * leer el texto, asi que se fija la PROPIEDAD, no la linea.
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
const MENU = 'src/components/ui/menu-del-usuario.tsx';
const INSIGNIA = 'src/components/ui/insignia-entorno.tsx';

async function main() {
  const layout = leer(LAYOUT);
  const sidebar = leer(SIDEBAR);

  //  PRECONDICIONES, ciertas en los DOS estados (antes y despues del lote). Si
  //  codificaran el estado posterior, la contraprueba reventaria en vez de fallar
  //  comprobacion a comprobacion.
  if (layout === '') throw new Error('Precondicion: no esta ClientLayout');
  if (sidebar === '') throw new Error('Precondicion: no esta el sidebar');
  if (!/<CampanaAvisos \/>/.test(layout)) throw new Error('Precondicion: ya no hay campana en la barra');
  if (!/handleLogout/.test(layout)) throw new Error('Precondicion: ya no existe handleLogout');
  //  La franja de PRUEBA tiene que seguir ahi en los dos estados: es lo que este
  //  lote NO toca, y si desapareciera habria que enterarse.
  if (!/OPERACIONES FISCALMENTE NULAS/.test(layout)) {
    throw new Error('Precondicion: la franja de modo prueba ya no esta');
  }
  //  EL ENTORNO SIGUE LLEGANDO AL SIDEBAR aunque su rotulo se vaya: lo usa para
  //  dejar hueco a la franja de arriba (`entorno !== 'PROD' ? 'pt-24' : 'pt-14'`).
  //  Si se quitara, el menu se metaria debajo de la franja. Es PRECONDICION y no
  //  comprobacion porque ya era verdad antes del lote: como comprobacion sobrevivia
  //  a la contraprueba y no comprobaba nada de este lote.
  if (!/entorno=\{entorno\}/.test(layout) || !/entorno !== 'PROD'/.test(sidebar)) {
    throw new Error('Precondicion: el sidebar ya no recibe el entorno para el hueco de la franja');
  }
  console.log('  pre   la campana, handleLogout, la franja de PRUEBA y el hueco del sidebar siguen ahi');

  const codigoLayout = sinComentarios(layout);
  const codigoSidebar = sinComentarios(sidebar);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La regla del rotulo, EJECUTADA\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Perezoso: un `import` estatico de un modulo que este lote crea revienta la
  //  contraprueba con "Cannot find module" en vez de dar FALLA por etiqueta.
  let M: typeof import('../src/utils/entornoVisible') | null = null;
  try { M = await import('../src/utils/entornoVisible'); } catch { M = null; }

  const ETIQUETAS = [
    'produccion se llama Produccion y se sabe que es produccion',
    'prueba dice que lo emitido NO vale (la consecuencia, no el nombre)',
    'cada entorno tiene su color; no se confunden a simple vista',
    'un valor que hoy no puede llegar tampoco se queda sin rotulo',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/entornoVisible.ts');
  } else {
    const { rotuloDelEntorno } = M;
    const prod = rotuloDelEntorno('PROD');
    const test = rotuloDelEntorno('TEST');
    const cert = rotuloDelEntorno('CERT');

    ok(ETIQUETAS[0], prod.titulo === 'Producción' && prod.esProduccion === true, prod.titulo);
    //  ESTO ES EL VALOR DEL LOTE: quitar la etiqueta no puede quitar el dato. Y el
    //  dato no es "Pruebas", es que lo que se emita no tiene validez fiscal.
    ok(ETIQUETAS[1],
      /nula|no tiene validez|sin validez/i.test(test.detalle) && test.esProduccion === false,
      test.detalle);
    ok('  y produccion dice que SI la tiene', /validez fiscal/i.test(prod.detalle), prod.detalle);
    ok(ETIQUETAS[2],
      new Set([prod.clasePunto, test.clasePunto, cert.clasePunto]).size === 3);
    ok(ETIQUETAS[3],
      cert.titulo.length > 0 && cert.detalle.length > 0 && cert.clasePunto.length > 0
      && cert.esProduccion === false);
    //  Ningun rotulo puede salir vacio: un globo vacio es peor que no tener globo,
    //  porque parece que el sistema no sabe donde esta.
    ok('  ningun rotulo sale vacio',
      ([prod, test, cert] as const).every(r =>
        r.titulo.trim() !== '' && r.detalle.trim() !== '' && r.clasePunto.trim() !== ''));
    //  Y la regla es PURA: nada de React ni de `window`, o no se podria ejecutar
    //  aqui. Se comprueba sobre el fichero, que es donde se ve.
    const fuente = leer('src/utils/entornoVisible.ts');
    ok('  la regla no arrastra React ni el navegador',
      fuente !== '' && !/^import /m.test(fuente) && !/window\.|localStorage/.test(fuente));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El entorno, al lado de la campana y sin etiqueta\n');
  // ───────────────────────────────────────────────────────────────────────────
  const insignia = leer(INSIGNIA);
  ok('la insignia del entorno esta en la barra de arriba',
    /<InsigniaEntorno/.test(codigoLayout) && /from '@\/components\/ui\/insignia-entorno'/.test(layout));
  //  AL LADO DE LA CAMPANA, no en cualquier sitio de la barra: es lo que se pidio.
  //
  //  SE MIRA LA ADYACENCIA, NO EL ORDEN. La primera version exigia que la insignia
  //  fuera DESPUES de la campana, y en el lote 193 el dueño la pidio al otro lado
  //  ('ponlo del lado izquierdo y no lo separes tanto'). La comprobacion se puso en
  //  rojo sin que faltara nada: fijaba la FORMA de entonces y no la propiedad, que es
  //  que las dos vayan JUNTAS -- que el entorno se lea con la campana y no flotando
  //  entre la campana y el avatar como si fuera otra cosa.
  const entreLasDos = (() => {
    const i = codigoLayout.indexOf('<CampanaAvisos />');
    const j = codigoLayout.indexOf('<InsigniaEntorno');
    if (i < 0 || j < 0) return null;
    const [primero, segundo] = i < j
      ? [i + '<CampanaAvisos />'.length, j]
      : [j + '<InsigniaEntorno entorno={entorno} />'.length, i];
    return segundo > primero ? codigoLayout.slice(primero, segundo) : null;
  })();
  ok('  pegada a la campana, sin nada en medio (a un lado o al otro)',
    entreLasDos !== null && !/<[A-Za-z]/.test(entreLasDos),
    entreLasDos === null ? 'no van seguidas' : JSON.stringify(entreLasDos.trim().slice(0, 40)));
  ok('  y recibe el entorno de verdad, no un valor fijo',
    /<InsigniaEntorno entorno=\{entorno\}/.test(codigoLayout));

  //  SIN ETIQUETA: el punto no lleva texto al lado. Se comprueba que el rotulo
  //  aparece SOLO dentro del globo, y el globo esta oculto hasta el hover.
  const codigoInsignia = sinComentarios(insignia);
  ok('el punto no lleva texto al lado (solo el color)',
    insignia !== '' && !/SANDBOX|PRUEBA<|Producción<|>Pruebas</.test(codigoInsignia));
  ok('  el rotulo sale al pasar por encima', /group-hover\/entorno:opacity-100/.test(codigoInsignia));
  ok('  y esta oculto mientras no se pasa', /opacity-0/.test(codigoInsignia));
  //  UN COLOR NO ES INFORMACION para quien no lo distingue ni para un lector de
  //  pantalla: quitar la etiqueta no puede quitarles el dato.
  ok('  el rotulo tambien llega a quien no ve el color',
    /aria-label=/.test(codigoInsignia) && /role="status"/.test(codigoInsignia));
  //  El globo del navegador saldria ADEMAS del nuestro, tarde y con otro aspecto.
  //  ATADA AL POSITIVO: sin el fichero -- o sea antes del lote -- "no hay title" es
  //  cierto de balde, porque no hay nada. Se exige que EXISTA nuestro globo y que
  //  ademas no haya el del navegador.
  ok('  y no hay dos globos (nuestro y el del navegador)',
    /group-hover\/entorno:opacity-100/.test(codigoInsignia) && !/title=/.test(codigoInsignia));
  ok('  el color y el texto salen de la regla, no escritos aqui',
    /rotuloDelEntorno\(/.test(codigoInsignia)
    && !/bg-emerald-500|bg-amber-400/.test(codigoInsignia));

  //  LA PASTILLA "SANDBOX" SE VA: era este mismo dato con etiqueta, al lado de la
  //  campana. La negativa va ATADA a la marca positiva, o seria cierta de balde en
  //  cualquier fichero que no la tuviera nunca.
  //
  //  ACOTADO A LA BARRA, y no al fichero: la franja de arriba tambien dice
  //  "MODO PRUEBA (SANDBOX)" y esa SE QUEDA, asi que buscar la palabra en todo el
  //  fichero daba FALLA por lo que no hay que cambiar. La franja vive FUERA del
  //  `<nav>`; la pastilla estaba dentro.
  //  Desde el GRUPO DERECHO de la barra y no desde la campana: en el lote 193 la
  //  insignia paso a ir ANTES de la campana, y una rebanada que empezaba en la
  //  campana se la dejaba fuera -- daba FALLA por lo que no habia que cambiar.
  const barraDerecha = (() => {
    const i = codigoLayout.indexOf("flex items-center gap-4");
    if (i < 0) return '';
    const j = codigoLayout.indexOf('</nav>', i);
    return j > -1 ? codigoLayout.slice(i, j) : '';
  })();
  if (barraDerecha === '') throw new Error('Precondicion: no se acota el lado derecho de la barra');
  ok('la pastilla SANDBOX de la barra se retira (era el mismo dato con etiqueta)',
    /<InsigniaEntorno/.test(barraDerecha) && !/SANDBOX/.test(barraDerecha));
  //  Y con ella su explicacion por toast: el porque ("el ambiente se cambia en
  //  Ajustes") no se pierde -- pasa al globo, que sale sin tener que pulsar.
  ok('  y el entorno se explica sin pulsar nada',
    !/El ambiente está enlazado/.test(codigoLayout));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Cerrar sesion, dentro del avatar\n');
  // ───────────────────────────────────────────────────────────────────────────
  const menu = leer(MENU);
  const codigoMenu = sinComentarios(menu);
  ok('el avatar de la barra abre el menu de la cuenta',
    /<MenuDelUsuario/.test(codigoLayout) && /from '@\/components\/ui\/menu-del-usuario'/.test(layout));
  //  EL DEFECTO QUE SE ARREGLA DE PASO: el avatar prometia un clic que no existia.
  //
  //  ACOTADO AL BOTON QUE LLEVA EL AVATAR. Un mutante que dejaba ese `onClick` vacio
  //  SOBREVIVIO: `onClick={() => setAbierto` tambien lo cumple la capa que cierra al
  //  pulsar fuera (`setAbierto(false)`), que esta en el mismo fichero. Buscar el
  //  patron en todo el componente comprobaba otro clic, no el del avatar.
  const botonDelAvatar = (() => {
    const j = codigoMenu.indexOf('<Avatar');
    if (j < 0) return '';
    const i = codigoMenu.lastIndexOf('<button', j);
    return i > -1 ? codigoMenu.slice(i, j) : '';
  })();
  ok('  y ahora el clic hace algo (antes solo tenia el cursor de mano)',
    botonDelAvatar !== '' && /onClick=\{[^}]*setAbierto/.test(botonDelAvatar),
    botonDelAvatar === '' ? 'no se encuentra el boton del avatar' : '');
  ok('cerrar sesion esta dentro del menu del avatar',
    /Cerrar Sesión/.test(codigoMenu) && /onCerrarSesion\(\)/.test(codigoMenu));
  //  MERA PRESENCIA: que el boton exista no basta; tiene que estar enchufado a la
  //  funcion que cierra la sesion de verdad.
  ok('  enchufado a handleLogout, no a un hueco',
    /onCerrarSesion=\{handleLogout\}/.test(codigoLayout));
  ok('  el menu se cierra al elegir, para no dejarlo abierto sobre la pantalla',
    /setAbierto\(false\); onCerrarSesion\(\)/.test(codigoMenu));
  ok('se puede salir del menu sin elegir nada: Escape y pulsando fuera',
    /'Escape'/.test(codigoMenu) && /fixed inset-0/.test(codigoMenu));
  //  El oyente de Escape solo mientras esta abierto: si no, se traga el Escape de
  //  los dialogos de toda la aplicacion.
  ok('  y el oyente de Escape no se queda puesto con el menu cerrado',
    /if \(!abierto\) return;/.test(codigoMenu));
  //  En el movil el nombre de al lado esta oculto (`hidden sm:flex`), asi que el
  //  menu es el unico sitio donde comprobar con que cuenta se trabaja.
  ok('  el menu dice con que cuenta y con que rol se esta trabajando',
    /\{nombre\}/.test(codigoMenu) && /\{rol/.test(codigoMenu));
  //  Un `<button>` dentro de un `<button>` es HTML invalido: el de cerrar sesion
  //  tiene que estar FUERA del que abre el menu.
  const finDelBoton = codigoMenu.lastIndexOf('</button>');
  const dondeCerrar = codigoMenu.indexOf('Cerrar Sesión');
  ok('  y el boton de cerrar sesion no esta anidado dentro del que abre',
    finDelBoton > -1 && dondeCerrar > -1 && codigoMenu.indexOf('</button>') < dondeCerrar);

  //  YA NO ESTA EN EL PIE DEL MENU, ni el boton ni el rotulo del entorno. Atado a
  //  la marca positiva del estado nuevo, o es cierto de balde.
  ok('el pie del menu lateral ya no lleva cerrar sesion',
    /<MenuDelUsuario/.test(codigoLayout) && !/Cerrar Sesión/.test(codigoSidebar));
  ok('  ni el rotulo del entorno',
    /<InsigniaEntorno/.test(codigoLayout)
    && !/Producción' : entorno === 'CERT'/.test(codigoSidebar));
  //  Y las propiedades que ya no se usan no se quedan colgando: un `onLogout` que
  //  nadie llama es la clase de cabo suelto que hace creer que sigue habiendo un
  //  boton en el menu.
  ok('  y el sidebar ya no pide un onLogout que nadie usaria',
    !/onLogout/.test(codigoSidebar) && !/onLogout=/.test(codigoLayout));


  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  LA FRANJA DE MODO PRUEBA SE QUEDA -- dice que las operaciones son fiscalmente
  //  nulas, y eso es una advertencia legal, no un adorno. No va aqui como
  //  comprobacion sino como PRECONDICION (arriba): es verdad en los dos estados, asi
  //  que como comprobacion regalaba un OK en la contraprueba. Si alguien la retira,
  //  este banco no dira "FALLA": se negara a correr, que es mas ruidoso.
  //  El lote mueve el boton; no cambia lo que hace. Pedir confirmacion seria otra
  //  decision, y es del dueño.
  //  ATADA AL POSITIVO, como la del globo: sin el fichero no hay `confirm` porque no
  //  hay nada.
  ok('cerrar sesion sigue sin pedir confirmacion, como estaba',
    /onCerrarSesion\(\)/.test(codigoMenu) && !/confirm|useConfirm/i.test(codigoMenu));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
