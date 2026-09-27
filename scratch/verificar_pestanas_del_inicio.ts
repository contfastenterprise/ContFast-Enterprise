/**
 * Lote 208 -- Inteligencia de Negocio y el Agente Empresarial salen del menu lateral y se
 * ven como pestañas del inicio, arriba a la derecha.
 *
 * Pedido del dueño el 2026-09-26: "quita Inteligencia de Negocio y Agente empresarial del
 * Sidebar y ponlo como tab en el menu de inicio", y despues "los tab ponlo en la parte
 * superior derecha".
 *
 * POR QUE TIENE SENTIDO: el menu tiene CINCUENTA elementos en nueve grupos (medido en el
 * lote 189) y estas dos son pantallas de CONSULTA -- se miran, no se registra nada en
 * ellas. El inicio es donde se mira.
 *
 * LO QUE ESTE LOTE NO HACE, Y ES LA DECISION QUE MAS IMPORTA
 * ---------------------------------------------------------
 * **No borra las filas de `route_mappings`, ni retira las rutas.** Cada fila lleva el
 * `module` y la `action` con los que `canAccessRoute` decide quien puede entrar; sin
 * fila, la ruta se queda sin permiso asignado. Y la tabla no tiene `company_id`, asi que
 * un borrado alcanzaria a las SEIS empresas. Es exactamente lo que el lote 190 estuvo a
 * punto de hacer con `antiguedad-saldos`: lo que se quita es la ENTRADA DEL MENU
 * (`isMenuItem: false`), no la pantalla.
 *
 * SE EJECUTA LA REGLA, no se lee: `pestanasVisibles` y `pestanaActiva` corren de verdad,
 * con permisos de mentira, que es lo que permite comprobar el caso que de verdad importa
 * -- que `?tab=bi` escrito a mano no ensena la pestaña a quien no puede verla.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

/**
 * Las comprobaciones que EJECUTAN la regla, en orden.
 *
 * El modulo es NUEVO, asi que en la contraprueba el `import` lanza. Sin esto el banco se
 * pararia ahi y las demas no se reportarian, que se lee igual que "no fallaron".
 */
const ETIQUETAS_EJECUTADAS: readonly string[] = [
  'quien puede con las dos, ve las tres pestañas',
  '  el Resumen SIEMPRE esta, aunque no se pueda con ninguna otra',
  '  y quien solo puede con una, ve esa y el Resumen',
  '  la visibilidad sale de la ruta, no de una lista escrita aparte',
  'sin nada pedido, se abre la primera',
  '  una clave que no existe no deja la pantalla en blanco',
  '  y una que existe pero NO se puede ver tampoco se abre',
  '  lo pedido se respeta cuando se puede ver',
];

function fallarLasQueQuedan(motivo: string): void {
  for (const t of ETIQUETAS_EJECUTADAS.slice(contadas)) ok(t, false, motivo);
}

const REGLA = 'src/utils/pestanasDelInicio.ts';
const INICIO = 'src/app/dashboard/page.tsx';
const MAPEOS = 'src/constants/defaultMappings.ts';
const RUTA_BI = 'src/app/dashboard/bi/page.tsx';
const RUTA_AGENTE = 'src/app/dashboard/proposals/page.tsx';
const VISTA_BI = 'src/components/bi/vista-inteligencia-negocio.tsx';
const VISTA_AGENTE = 'src/components/agente/vista-agente-empresarial.tsx';

async function main() {
  //  PRECONDICIONES, ciertas en los DOS estados: las dos pantallas existen y el inicio
  //  sigue siendo el inicio. Si alguien las retira de verdad, este banco no debe dar
  //  FALLA -- debe negarse a correr.
  if (leer(INICIO) === '') throw new Error('Precondicion: no esta la pantalla de inicio');
  if (!/dashboard\/bi%/.test(leer(MAPEOS)) || !/dashboard\/proposals%/.test(leer(MAPEOS))) {
    throw new Error('Precondicion: las dos rutas ya no estan en los mapeos; se habran retirado');
  }
  console.log('  pre   el inicio y los mapeos de las dos rutas siguen en pie');

  try {

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Quien ve cada pestaña -- EJECUTADO\n');
  // ───────────────────────────────────────────────────────────────────────────
  const M = await import('../src/utils/pestanasDelInicio');

  const todo = () => true;
  const nada = () => false;
  const soloBi = (r: string) => r === '/dashboard/bi';

  const conTodo = M.pestanasVisibles(todo);
  ok('quien puede con las dos, ve las tres pestañas',
    conTodo.length === 3 && conTodo.map(p => p.clave).join(',') === 'resumen,bi,agente',
    conTodo.map(p => p.clave).join(','));
  //  EL RESUMEN NO TIENE RUTA A PROPOSITO: es el inicio, y quien llego al inicio ya paso
  //  por su comprobacion. Si dependiera de un permiso, alguien podria quedarse sin NINGUNA
  //  pestaña -- o sea con la pantalla de inicio vacia.
  const sinNada = M.pestanasVisibles(nada);
  ok('  el Resumen SIEMPRE esta, aunque no se pueda con ninguna otra',
    sinNada.length === 1 && sinNada[0]?.clave === 'resumen');
  const parcial = M.pestanasVisibles(soloBi);
  ok('  y quien solo puede con una, ve esa y el Resumen',
    parcial.map(p => p.clave).join(',') === 'resumen,bi', parcial.map(p => p.clave).join(','));
  //  LA REGLA PREGUNTA POR LA RUTA, no por un rol escrito aqui: es lo que mantiene la
  //  pestaña y la ruta diciendo lo mismo el dia que cambie el permiso.
  const preguntadas: string[] = [];
  M.pestanasVisibles((r) => { preguntadas.push(r); return true; });
  ok('  la visibilidad sale de la ruta, no de una lista escrita aparte',
    preguntadas.join(',') === '/dashboard/bi,/dashboard/proposals', preguntadas.join(','));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) Que pestaña se abre -- y la que NO puede abrirse\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('sin nada pedido, se abre la primera',
    M.pestanaActiva(null, conTodo) === 'resumen'
    && M.pestanaActiva(undefined, conTodo) === 'resumen'
    && M.pestanaActiva('', conTodo) === 'resumen');
  ok('  una clave que no existe no deja la pantalla en blanco',
    M.pestanaActiva('no-existe', conTodo) === 'resumen');
  //  ESTA ES LA QUE DE VERDAD PROTEGE. Sin ella, escribir `?tab=bi` en la barra de
  //  direcciones ensenaria Inteligencia de Negocios a cualquiera: la pestaña estaria
  //  escondida del listado pero el contenido se pintaria igual. Es el mismo agujero que
  //  tendria un menu que solo oculta el enlace.
  ok('  y una que existe pero NO se puede ver tampoco se abre',
    M.pestanaActiva('bi', sinNada) === 'resumen'
    && M.pestanaActiva('agente', parcial) === 'resumen');
  ok('  lo pedido se respeta cuando se puede ver',
    M.pestanaActiva('bi', conTodo) === 'bi'
    && M.pestanaActiva('agente', conTodo) === 'agente'
    && M.pestanaActiva('bi', parcial) === 'bi');

  } catch (e: unknown) {
    //  Si lanza, es que falla.
    fallarLasQueQuedan(`lanzo: ${(e as Error)?.message?.slice(0, 70) ?? 'sin motivo'}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Fuera del menu -- pero SIN perder el permiso ni la ruta\n');
  // ───────────────────────────────────────────────────────────────────────────
  const mapeos = sinComentarios(leer(MAPEOS));
  const filaDe = (patron: string): string => {
    const i = mapeos.indexOf(patron);
    if (i < 0) return '';
    return mapeos.slice(mapeos.lastIndexOf('{', i), mapeos.indexOf('}', i));
  };
  const filaBi = filaDe('/dashboard/bi%');
  const filaAgente = filaDe('/dashboard/proposals%');
  ok('las dos dejan de ser elemento de menu',
    /isMenuItem: false/.test(filaBi) && /isMenuItem: false/.test(filaAgente));
  //  LO QUE NO SE HACE, Y ES EL CORAZON DEL LOTE -- PERO VA DE PRECONDICION, NO DE
  //  COMPROBACION. Las dos son ciertas ANTES de este lote (la fila con su permiso ya
  //  estaba, y las rutas ya existian), asi que como comprobaciones regalaban un OK en la
  //  contraprueba: sobrevivieron las dos. Lo que hay que exigir es que este lote no las
  //  rompa, y si alguien se las lleva de verdad, el banco no debe dar FALLA -- debe
  //  negarse a correr, que es lo que obliga a mirar por que.
  //
  //  Por que importan: la fila lleva el `module` y la `action` con los que decidir quien
  //  entra en la ruta, y la tabla no tiene `company_id`, asi que perderla seria en las
  //  SEIS empresas a la vez (leccion del lote 190). Y las rutas siguen respondiendo
  //  porque hay enlaces guardados apuntando ahi.
  if (!/module: 'administracion'/.test(filaBi) || !/action: 'read'/.test(filaBi)
    || !/module: 'administracion'/.test(filaAgente) || !/action: 'read'/.test(filaAgente)) {
    throw new Error('Precondicion: alguna de las dos rutas se quedo sin permiso asignado');
  }
  if (leer(RUTA_BI) === '' || leer(RUTA_AGENTE) === '') {
    throw new Error('Precondicion: alguna de las dos rutas ya no existe');
  }
  console.log('  pre   las dos rutas siguen existiendo y conservan su permiso');
  ok('  con el cuerpo en un componente, que es lo que comparten ruta y pestaña',
    /from '@\/components\/bi\/vista-inteligencia-negocio'/.test(leer(RUTA_BI))
    && /from '@\/components\/agente\/vista-agente-empresarial'/.test(leer(RUTA_AGENTE))
    && leer(VISTA_BI) !== '' && leer(VISTA_AGENTE) !== '');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) El inicio: la barra, donde va y que decide\n');
  // ───────────────────────────────────────────────────────────────────────────
  const inicio = sinComentarios(leer(INICIO));
  ok('el inicio pinta las dos vistas como pestañas',
    /activa === 'bi' && <VistaInteligenciaNegocio enPestana \/>/.test(inicio)
    && /activa === 'agente' && <VistaAgenteEmpresarial enPestana \/>/.test(inicio));
  //  LA REGLA NO SE REIMPLEMENTA (leccion del lote 190): la pantalla llama a la funcion.
  ok('  y no reimplementa quien las ve: llama a la regla',
    /pestanasVisibles\(canAccessRoute\)/.test(inicio)
    && /pestanaActiva\(searchParams\.get\('tab'\), visibles\)/.test(inicio)
    && !/esAdminOSistemas/.test(inicio));
  //  ARRIBA A LA DERECHA (pedido del dueño): dentro de la cabecera, que reparte con
  //  `justify-between`, asi que el grupo queda a la derecha del titulo.
  //  LA CABECERA DE VERDAD, no la primera que aparezca: el ESQUELETO de carga tiene su
  //  propio `<header>` y va antes en el fichero, asi que `indexOf('<header')` cazaba ese
  //  -- que no tiene barra ninguna -- y las dos comprobaciones fallaban sin faltar nada.
  //  Es la trampa del `indexOf` que este repositorio lleva anotada cinco veces. Se ancla
  //  en el titulo, que es lo que distingue una cabecera de la otra.
  const cabecera = (() => {
    const t = inicio.indexOf('Dashboard Principal');
    if (t < 0) return '';
    const i = inicio.lastIndexOf('<header', t);
    const j = inicio.indexOf('</header>', t);
    return i < 0 || j < 0 ? '' : inicio.slice(i, j);
  })();
  ok('  la barra va DENTRO de la cabecera, o no quedaria arriba a la derecha',
    /<nav/.test(cabecera) && /justify-between/.test(cabecera), cabecera === '' ? 'no hay cabecera' : '');
  ok('  y despues del titulo, que es lo que la manda a la derecha',
    cabecera.indexOf('Dashboard Principal') < cabecera.indexOf('<nav'));
  //  UNA BARRA DE UNA SOLA PESTAÑA NO DICE NADA: quien no puede ver ninguna de las dos no
  //  tiene por que cargar con un selector.
  //  CON LA LLAVE DELANTE, y no es cosmetica: un mutante que puso `{false && visibles.length
  //  > 1 && (` -- o sea, que apagaba la barra entera -- SOBREVIVIA, porque el texto seguia
  //  ahi. Mera presencia, otra vez. Anclado al `{` no cabe nada delante de la condicion.
  ok('  y no sale cuando solo habria una pestaña',
    /\{visibles\.length > 1 && \(/.test(inicio));
  //  Y QUE ESTE, que la negacion de arriba tambien seria cierta si no hubiera barra.
  ok('  pero sale cuando hay mas de una',
    /<nav/.test(inicio) && /\{visibles\.map\(/.test(inicio));
  //  LA PESTAÑA EN LA URL: enlazable, y sobrevive a una recarga.
  ok('la pestaña va en la URL, no solo en el estado',
    /useSearchParams\(\)/.test(inicio) && /\/dashboard\?tab=\$\{clave\}/.test(inicio));
  ok('  con `replace`, que no llena el boton de atras',
    /router\.replace\(clave ===/.test(inicio) && !/router\.push\(clave ===/.test(inicio));
  //  EL ESQUELETO DE CARGA ES DEL RESUMEN. Si bloqueara la pantalla entera, abrir
  //  `?tab=bi` esperaria a unos datos que esa pestaña no usa.
  ok('  y el esqueleto de carga solo detiene al Resumen',
    /if \(loading && activa === 'resumen'\)/.test(inicio));
  //  ACCESIBLE: el color no es informacion para todo el mundo.
  ok('  la pestaña activa se dice, no solo se colorea',
    /aria-current=\{activa === p\.clave \? 'page' : undefined\}/.test(inicio));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) Dentro de la pestaña: sin titulo repetido, pero con su boton\n');
  // ───────────────────────────────────────────────────────────────────────────
  const vistaBi = leer(VISTA_BI);
  const vistaAgente = leer(VISTA_AGENTE);
  ok('las dos vistas saben si estan en una pestaña',
    /enPestana = false/.test(vistaBi) && /enPestana = false/.test(vistaAgente));
  //  EL TITULO SE CALLA --lo dice la pestaña-- PERO EL BOTON NO: es funcion. Si se
  //  escondiera la cabecera entera, la pestaña de BI no podria recargar su analisis y la
  //  del agente no podria generar nada.
  ok('  el titulo se calla dentro de la pestaña',
    /enPestana \? <div \/> : \(/.test(sinComentarios(vistaBi))
    && /enPestana \? <div \/> : \(/.test(sinComentarios(vistaAgente)));
  ok('  pero el boton de accion se queda, que es funcion y no adorno',
    /Sincronizar Análisis/.test(vistaBi) && /Generar Análisis de Flujo/.test(vistaAgente));
  //  DENTRO DE UNA PESTAÑA DE `/dashboard` NO SE REDIRIGE A `/dashboard`: seria irse a uno
  //  mismo, con un aviso de error por delante. Por la ruta si se redirige, como siempre.
  ok('  y no se redirige a uno mismo desde una pestaña de la propia pantalla',
    /if \(enPestana\) return;/.test(sinComentarios(vistaBi))
    && /router\.replace\('\/dashboard'\)/.test(vistaBi));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
