/**
 * Lote 195 -- el menu deja de leer el navegador mientras se pinta.
 *
 * EL DEFECTO, REPORTADO POR EL DUEÑO (2026-09-25), Y ES MIO
 * --------------------------------------------------------
 *     Hydration failed because the server rendered HTML didn't match the client.
 *     As a result this tree will be regenerated on the client.
 *
 * El aviso señalaba el `motion.div` del submenu de un grupo y la clase del chevron
 * (`rotate-180`), que es exactamente lo que cambia cuando un grupo esta abierto.
 *
 * La causa: los lotes 189 (grupos abiertos) y 191 (favoritos anclados) leian su
 * preferencia en el INICIALIZADOR del `useState`:
 *
 *     useState(() => (typeof window === 'undefined' ? {} : leerGruposGuardados()))
 *
 * En el servidor eso da `{}` -- todo plegado -- y en el navegador da lo que la
 * persona dejo abierto. El HTML del servidor y el primer pintado del cliente no
 * coinciden, React tira su arbol y lo reconstruye: el menu entero se repinta en
 * cada carga de cada pantalla, con el aviso en la consola.
 * **Medido**: en todo `src/` solo esos DOS sitios lo hacian.
 *
 * Y el banco del 189 tenia una comprobacion que **defendia el defecto** -- "y se
 * lee al arrancar, no despues" -- con un comentario justificandolo. Esa se
 * INVIERTE, no se borra: es lo que se hizo en la revision de los lotes 114-118 con
 * las lineas repetidas.
 *
 * LA CURA, Y POR QUE NO SE PIERDE LO QUE EL 189 QUERIA
 * ---------------------------------------------------
 * El valor de partida es el mismo en los dos lados, y la preferencia se restaura en
 * un `useLayoutEffect`: despues de montar y **antes de que el navegador pinte**. Asi
 * el HTML que React compara es identico y nadie llega a ver el menu plegado.
 *
 * LO QUE ESTE BANCO EJECUTA: la validacion de lo guardado, que ahora es pura
 * (`utils/preferenciasDelMenu`). Antes vivia dentro del componente y solo se podia
 * comprobar leyendo el texto del fichero -- que la linea estuviera escrita, no que
 * funcionara.
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
const HOOK = 'src/hooks/usePreferenciaDelNavegador.ts';
const UTIL = 'src/utils/preferenciasDelMenu.ts';

async function main() {
  const sb = leer(SIDEBAR);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (sb === '') throw new Error('Precondicion: no esta el sidebar');
  //  Las dos preferencias siguen existiendo: este lote cambia COMO se recuerdan, no
  //  si se recuerdan.
  if (!/CLAVE_GRUPOS/.test(sb)) throw new Error('Precondicion: ya no se recuerdan los grupos abiertos');
  if (!/CLAVE_FAVORITOS/.test(sb)) throw new Error('Precondicion: ya no se recuerda lo anclado');
  if (!/expandedGroups/.test(sb) || !/favoritos/.test(sb)) {
    throw new Error('Precondicion: se fueron los grupos abiertos o los favoritos');
  }
  console.log('  pre   el menu sigue recordando los grupos abiertos y lo anclado');

  const codigo = sinComentarios(sb);
  const hook = leer(HOOK);
  const codigoHook = sinComentarios(hook);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Lo que se pinta no depende del navegador\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  ESTA ES LA COMPROBACION DEL LOTE. Nada de lo que decide el HTML puede venir de
  //  `localStorage` mientras se pinta.
  ok('el menu no lee el navegador para decidir lo que pinta',
    !/typeof window === 'undefined' \? [^\n]*leer/.test(codigo)
    && !/useState<Record<string, boolean>>\(\s*\(\) => \(typeof window/.test(codigo)
    && !/useState<string\[\]>\(\s*\(\) => \(typeof window/.test(codigo));
  //  La negativa va ATADA a la marca positiva: sin el hook, "no lee el navegador" es
  //  cierto de balde en cualquier fichero que no lo lea nunca.
  ok('  y la preferencia llega por el hook que la restaura despues de montar',
    /usePreferenciaDelNavegador/.test(codigo)
    && /from '@\/hooks\/usePreferenciaDelNavegador'/.test(sb));
  //  El valor de partida es lo que pinta el servidor: tiene que estar a la vista y no
  //  depender de nada.
  ok('  el valor de partida es una constante, la misma en el servidor y en el cliente',
    /const VACIO_GRUPOS: Record<string, boolean> = \{\};/.test(codigo)
    && /const VACIO_FAVORITOS: string\[\] = \[\];/.test(codigo));
  ok('las dos preferencias pasan por el mismo camino',
    (codigo.match(/usePreferenciaDelNavegador</g) || []).length === 2,
    `${(codigo.match(/usePreferenciaDelNavegador</g) || []).length} de 2`);
  //  MISMO CAMINO, CLAVES DISTINTAS. Un mutante que le daba `CLAVE_GRUPOS` a los
  //  favoritos SOBREVIVIO a este banco: la propiedad solo la vigilaba el banco del
  //  191, y es del mecanismo que se estrena aqui. Compartir clave no daria un error:
  //  abrir un grupo BORRARIA las anclas y al contrario, en silencio.
  //  `[^>]*` no vale: el tipo de los grupos es `<Record<string, boolean>>` y se para
  //  en el primer `>`. Hasta el parentesis de la llamada, sin pasarse de largo.
  const clavesUsadas = [...codigo.matchAll(/usePreferenciaDelNavegador<[\s\S]{0,60}?\(\s*([A-Z_]+),/g)]
    .map(m => m[1]);
  ok('  cada una con su clave: compartirla borraria la otra en silencio',
    clavesUsadas.length === 2 && new Set(clavesUsadas).size === 2,
    clavesUsadas.join(' y ') || 'no se encuentran las claves');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) Se restaura antes de pintar, no en el inicializador\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('la preferencia se restaura con un efecto de layout (antes del pintado)',
    hook !== '' && /useLayoutEffect/.test(codigoHook));
  //  En el servidor no hay pintado que adelantar y React avisa si se usa
  //  `useLayoutEffect`; por eso alli se usa el normal. Esto NO es el defecto de
  //  antes: decide QUE HOOK se usa, no QUE SE PINTA.
  ok('  y en el servidor se usa el normal, que alli no hay pintado que adelantar',
    /typeof window === 'undefined' \? useEffect : useLayoutEffect/.test(codigoHook));
  ok('  el valor de partida del estado es el que se recibe, sin mirar el navegador',
    /useState<T>\(inicial\)/.test(codigoHook));

  //  EL ORDEN IMPORTA Y NO ES UNA SUPOSICION: si el efecto que guarda corriera antes
  //  del que lee, escribiria el valor de partida y BORRARIA la preferencia justo
  //  antes de leerla.
  ok('no se guarda nada antes de haber intentado leer',
    /if \(!restaurado\.current\) return;/.test(codigoHook));
  ok('  y lo que se lee se aplica solo si habia algo guardado',
    /if \(leido !== null\) setValor\(leido\)/.test(codigoHook));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) La validacion de lo guardado, EJECUTADA\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Antes vivia dentro del componente y solo se podia comprobar leyendo el texto.
  let M: typeof import('../src/utils/preferenciasDelMenu') | null = null;
  try { M = await import('../src/utils/preferenciasDelMenu'); } catch { M = null; }

  const ETIQUETAS = [
    'los grupos guardados se leen tal cual',
    'basura en esa clave no se cuela en el estado',
    'lo anclado se lee como lista de rutas',
    'una ruta que no es una cadena no acaba en un enlace',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/preferenciasDelMenu.ts');
  } else {
    const { gruposDesdeTexto, favoritosDesdeTexto } = M;

    ok(ETIQUETAS[0],
      JSON.stringify(gruposDesdeTexto('{"Egresos":true,"Sistema":false}'))
        === JSON.stringify({ Egresos: true, Sistema: false }));
    //  Solo booleanos, clave a clave: lo que no encaja se descarta en vez de colarse
    //  en el estado, donde decidiria si un grupo se pinta abierto.
    ok(ETIQUETAS[1],
      JSON.stringify(gruposDesdeTexto('{"A":true,"B":"si","C":1,"D":null}'))
        === JSON.stringify({ A: true }),
      JSON.stringify(gruposDesdeTexto('{"A":true,"B":"si","C":1,"D":null}')));
    //  `null` es "no hay preferencia" y deja el valor de partida en pie. Un objeto
    //  VACIO es una preferencia de verdad ("lo deje todo cerrado") y se respeta: si
    //  los dos dieran lo mismo, cerrar todos los grupos no se recordaria.
    ok('  sin nada guardado no hay preferencia (null), y vacio SI es una preferencia',
      gruposDesdeTexto(null) === null && gruposDesdeTexto('') === null
      && JSON.stringify(gruposDesdeTexto('{}')) === '{}');
    //  Texto que no es JSON, o JSON de otra forma: no hay preferencia, y sobre todo
    //  NO REVIENTA.
    //
    //  SE ATRAPA LA EXCEPCION, y no es adorno: un mutante que quitaba el `try` del
    //  `JSON.parse` hizo que esta llamada LANZARA, y el banco entero aborto en vez de
    //  reportar FALLA -- o sea que el mutante quedo como "no se puede concluir". Si
    //  lanza, es que falla: eso es lo que hay que decir.
    const noRevienta = (() => {
      try {
        return gruposDesdeTexto('esto no es json') === null
          && gruposDesdeTexto('[1,2,3]') === null
          && gruposDesdeTexto('"texto"') === null
          && favoritosDesdeTexto('{{{') === null;
      } catch {
        return false;
      }
    })();
    ok('  texto que no es JSON no revienta: no hay preferencia', noRevienta);

    ok(ETIQUETAS[2],
      JSON.stringify(favoritosDesdeTexto('["/dashboard/invoices","/dashboard/expenses"]'))
        === JSON.stringify(['/dashboard/invoices', '/dashboard/expenses']));
    //  Un `null` o un numero colado en la lista acabaria en `<Link href={...}>`: un
    //  enlace roto en el sitio mas visible del menu.
    ok(ETIQUETAS[3],
      JSON.stringify(favoritosDesdeTexto('["/a",null,5,"","/b"]'))
        === JSON.stringify(['/a', '/b']),
      JSON.stringify(favoritosDesdeTexto('["/a",null,5,"","/b"]')));
    ok('  y sin nada guardado tampoco hay preferencia',
      favoritosDesdeTexto(null) === null && favoritosDesdeTexto('{"a":1}') === null
      && JSON.stringify(favoritosDesdeTexto('[]')) === '[]');
    //  SIN COMENTARIOS: el fichero EXPLICA en prosa que la lectura de `localStorage`
    //  vive en otro sitio, asi que buscar la palabra en el texto daba FALLA por el
    //  comentario que dice justo lo que se quiere comprobar. Lo que importa es que no
    //  la toque el CODIGO.
    const fuenteUtil = leer(UTIL);
    ok('  la validacion no arrastra React ni el navegador',
      fuenteUtil !== '' && !/^import /m.test(fuenteUtil)
      && !/window\.|localStorage/.test(sinComentarios(fuenteUtil)));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Nada de esto puede romper el menu\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Ventana privada, cookies bloqueadas, cuota llena: `localStorage` tira. Un menu
  //  que no se pinta por no poder leer una preferencia es peor que un menu sin
  //  preferencia.
  const lectura = (() => {
    const i = codigoHook.indexOf('useEfectoAntesDePintar(() => {');
    const j = codigoHook.indexOf('useEffect(() => {', i);
    return i > -1 && j > i ? codigoHook.slice(i, j) : '';
  })();
  const escritura = (() => {
    const i = codigoHook.indexOf('useEffect(() => {');
    return i > -1 ? codigoHook.slice(i) : '';
  })();
  ok('leer no lanza aunque el navegador se niegue',
    lectura !== '' && /try \{/.test(lectura) && /catch/.test(lectura));
  ok('  ni guardar', escritura !== '' && /try \{/.test(escritura) && /catch/.test(escritura));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
