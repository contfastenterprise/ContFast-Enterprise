/**
 * Lote 194 -- al abrir un grupo del menu, ese grupo sube arriba.
 *
 * DE DONDE SALE
 * -------------
 * Pedido del dueño (2026-09-25): *"quiero que cuando selecione el elemento
 * principal del sidebar, para desplegar, mueva a la parte superior, haciendo
 * scrool dicho elemento para que el desplegue se pueda ver completo"*.
 *
 * POR QUE NO LO RESOLVIA LO QUE YA HABIA
 * --------------------------------------
 * El lote 189 puso un `scrollIntoView`, pero es otro: trae a la vista el elemento
 * ACTIVO y con `block: 'nearest'` -- mover lo menos posible. Eso es lo contrario
 * de "llevalo arriba", y ademas el activo puede estar en un grupo distinto del que
 * acabas de abrir. Con 50 elementos en 9 grupos (hasta 59 filas), pulsar un grupo
 * de la mitad de abajo abria su submenu DEBAJO DEL PLIEGUE.
 *
 * LO QUE VIGILA ESTE BANCO, ADEMAS DE QUE ESTE
 * -------------------------------------------
 *  · Que la regla se EJECUTE (vive en `utils/grupoRecienAbierto`, importable).
 *  · Que **el orden de los dos efectos** se mantenga: los dos reaccionan al mismo
 *    cambio y piden cosas contrarias, y React ejecuta los efectos de un componente
 *    en el orden en que estan escritos. Intercambiarlos rompe el lote sin que falte
 *    una linea.
 *  · Que subir el grupo sea cosa del CLIC y no de la navegacion.
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

async function main() {
  const sb = leer(SIDEBAR);

  //  PRECONDICIONES, ciertas en los DOS estados (antes y despues del lote).
  if (sb === '') throw new Error('Precondicion: no esta el sidebar');
  if (!/function SidebarContent\(/.test(sb)) throw new Error('Precondicion: ya no existe SidebarContent');
  if (!/toggleGroup/.test(sb)) throw new Error('Precondicion: ya no se alternan los grupos');
  if (!/abrirGrupo/.test(sb)) throw new Error('Precondicion: ya no se abre solo el grupo de la pagina');
  //  El scroll del elemento activo (lote 189) tiene que seguir ahi: este lote no lo
  //  sustituye, convive con el.
  if (!/refActivo\.current\?\.scrollIntoView/.test(sb)) {
    throw new Error('Precondicion: se fue el scroll al elemento activo del lote 189');
  }
  const instancias = (sb.match(/<SidebarContent/g) || []).length;
  if (instancias !== 2) throw new Error(`Precondicion: se esperaban 2 <SidebarContent>, hay ${instancias}`);
  //  Con el menu PLEGADO no hay cabeceras que subir: los grupos se abren al pasar el
  //  raton, en un globo aparte. Este lote no lo toca, y es verdad en los dos estados:
  //  por eso va aqui y no como comprobacion.
  if (!/hoveredGroup === group\.title/.test(sb)) {
    throw new Error('Precondicion: los grupos del menu plegado ya no salen en globo al pasar el raton');
  }
  console.log('  pre   el sidebar, sus dos instancias, el alternar/abrir grupos, el scroll del 189 y el globo del menu plegado siguen ahi');

  const codigo = sinComentarios(sb);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La regla, EJECUTADA\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/utils/grupoRecienAbierto') | null = null;
  try { M = await import('../src/utils/grupoRecienAbierto'); } catch { M = null; }

  const ETIQUETAS = [
    'abrir un grupo cerrado lo señala para subirlo',
    'cerrar un grupo NO sube nada',
    'un grupo que nunca se toco cuenta como cerrado',
    'si no cambia nada, no hay nada que subir',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/grupoRecienAbierto.ts');
  } else {
    const { grupoRecienAbierto } = M;

    ok(ETIQUETAS[0],
      grupoRecienAbierto({ Egresos: false }, { Egresos: true }) === 'Egresos',
      String(grupoRecienAbierto({ Egresos: false }, { Egresos: true })));
    //  CERRAR NO MUEVE EL MENU: cerrar reduce la lista, no esconde nada debajo del
    //  pliegue, y mover el menu cuando solo querias plegar algo se lo lleva de
    //  debajo del raton.
    ok(ETIQUETAS[1],
      grupoRecienAbierto({ Egresos: true }, { Egresos: false }) === null,
      String(grupoRecienAbierto({ Egresos: true }, { Egresos: false })));
    //  `undefined` y ausente son los dos estados normales de lo guardado: solo se
    //  apuntan los grupos que alguien ha tocado alguna vez.
    ok(ETIQUETAS[2],
      grupoRecienAbierto({}, { Sistema: true }) === 'Sistema'
      && grupoRecienAbierto({ Sistema: undefined as unknown as boolean }, { Sistema: true }) === 'Sistema');
    ok(ETIQUETAS[3],
      grupoRecienAbierto({ A: true, B: false }, { A: true, B: false }) === null);
    //  Lo que ya estaba abierto no vuelve a subir: si contara, cualquier cambio en
    //  OTRO grupo subiria el primero que estuviera abierto.
    ok('  lo que ya estaba abierto no se vuelve a subir',
      grupoRecienAbierto({ A: true, B: false }, { A: true, B: true }) === 'B');
    //  Solo uno: subir dos seguidos dejaria al primero otra vez fuera de la vista.
    ok('  y si se abrieran dos a la vez, sube uno solo',
      grupoRecienAbierto({}, { A: true, B: true }) === 'A');
    const fuente = leer('src/utils/grupoRecienAbierto.ts');
    ok('  la regla no arrastra React ni el navegador',
      fuente !== '' && !/^import /m.test(fuente) && !/window\.|document\./.test(fuente));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El grupo sube, y sube ARRIBA\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('la cabecera del grupo se puede traer a la vista',
    /refsDeGrupo\.current\[group\.title\] = el/.test(codigo));
  //  `start` y no `nearest`: `nearest` mueve lo menos posible, que es justo lo que
  //  dejaba el submenu debajo del pliegue.
  ok('  y se lleva ARRIBA, no lo justo para verla',
    /refsDeGrupo\.current\[subirGrupo\.titulo\]\?\.scrollIntoView\(\{ block: 'start' \}\)/.test(codigo));
  ok('  usando la regla de fuera, no una copia dentro del componente',
    /grupoRecienAbierto\(/.test(codigo) && /from '@\/utils\/grupoRecienAbierto'/.test(sb));

  //  EL ORDEN DE LOS DOS EFECTOS ES LA PROPIEDAD, no un detalle de estilo: los dos
  //  reaccionan al mismo cambio y piden cosas contrarias (`nearest` contra `start`).
  //  React ejecuta los efectos en el orden en que estan escritos, asi que el ultimo
  //  deja el scroll donde queda. Intercambiarlos rompe el lote sin que falte nada.
  const dondeActivo = codigo.indexOf("refActivo.current?.scrollIntoView");
  const dondeGrupo = codigo.indexOf("refsDeGrupo.current[subirGrupo.titulo]");
  ok('el scroll del grupo va DESPUES del del elemento activo (gana el ultimo)',
    dondeActivo > -1 && dondeGrupo > dondeActivo,
    `activo en ${dondeActivo}, grupo en ${dondeGrupo}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Sube lo que abre una persona, no lo que abre la navegacion\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  ACOTADO A CADA FUNCION. `abrirGrupo` se llama en cada navegacion para abrir el
  //  grupo de la pagina actual; si eso subiera el menu, entrar a cualquier pantalla
  //  daria un salto que nadie pidio.
  const cuerpo = (desde: string, hasta: string) => {
    const i = codigo.indexOf(desde);
    if (i < 0) return '';
    const j = codigo.indexOf(hasta, i + desde.length);
    return j > -1 ? codigo.slice(i, j) : '';
  };
  const enToggle = cuerpo('const toggleGroup = React.useCallback', 'const abrirGrupo');
  const enAbrir = cuerpo('const abrirGrupo = React.useCallback', '}, []);');
  if (enToggle === '' || enAbrir === '') throw new Error('Precondicion: no se acotan toggleGroup y abrirGrupo');

  ok('al pulsar un grupo se decide si hay que subirlo', /setSubirGrupo\(/.test(enToggle));
  ok('  con la regla, no con una condicion escrita ahi mismo',
    /grupoRecienAbierto\(/.test(enToggle));
  ok('abrir el grupo de la pagina actual NO sube el menu',
    /setSubirGrupo\(/.test(enToggle) && !/setSubirGrupo\(/.test(enAbrir));

  //  Abrir DOS VECES el mismo grupo tiene que subirlo las dos veces. Sin un valor
  //  que cambie en cada clic, el segundo no dispararia el efecto.
  ok('abrir dos veces el mismo grupo lo sube las dos veces',
    /sello: \(prev\?\.sello \?\? 0\) \+ 1/.test(enToggle));
  //  Y no se puede "consumir" el aviso al usarlo: hay DOS instancias de
  //  `SidebarContent` y la primera en correr se lo quitaria a la otra.
  //  ATADA AL POSITIVO: 'no se consume' es cierto de balde donde no hay aviso
  //  ninguno, o sea antes del lote.
  ok('  y el aviso no se consume: las dos instancias se enteran',
    /setSubirGrupo\(/.test(codigo) && !/setSubirGrupo\(null\)/.test(codigo));
  ok('las dos instancias lo reciben',
    (codigo.match(/subirGrupo=\{subirGrupo\}/g) || []).length === 2,
    `${(codigo.match(/subirGrupo=\{subirGrupo\}/g) || []).length} de 2`);

  //  Un `setState` (o escribir un `ref`) DENTRO del actualizador de React es un
  //  efecto colateral que en modo estricto se ejecuta dos veces.
  //  ATADA AL POSITIVO, por lo mismo.
  ok('la decision no se toma dentro del actualizador de estado',
    /setSubirGrupo\(/.test(codigo)
    && !/setExpandedGroups\(prev => \{[\s\S]{0,400}setSubirGrupo/.test(codigo));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Lo que este lote NO toca, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  LAS DOS COSAS QUE ESTE LOTE NO TOCA VAN DE PRECONDICION, ARRIBA, no de
  //  comprobacion: el `nearest` del lote 189 y el globo de los grupos con el menu
  //  plegado son verdad ANTES y DESPUES, asi que como comprobacion regalaban un OK en
  //  la contraprueba. Como precondicion, el dia que alguien se las lleve este banco no
  //  dara FALLA: se negara a correr, que es mas ruidoso.
  console.log('  (van de precondicion, arriba: el `nearest` del 189 y el globo del menu plegado)');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
