/**
 * Cartera, lote 3: el permiso manda sobre lo que se enseña.
 *
 * Los lotes 1 y 2 daban por hecho que quien abre la pantalla puede abrir sus
 * dos pestañas. Al mirar `role_permissions` de verdad resulto que no:
 *
 *     facturacion  ->  cobros: SI      proveedores: NO (granted=false)
 *     compras      ->  cobros: NO      proveedores: SI
 *
 * Y las dos pestañas piden modulos distintos -- clientes exige `cobros`,
 * suplidores exige `proveedores` --, asi que enseñar siempre las dos significa
 * que ese usuario pulse una para recibir un 403: un "no puedes" disfrazado de
 * averia. Lo que este banco defiende:
 *
 *   - LA TIRA DE PESTAÑAS SE FILTRA POR PERMISO, con la misma comprobacion que
 *     usa la barra lateral, para que menu y pantalla no puedan discrepar.
 *
 *   - EL `loading` DEL RBAC NO ES UN "NO PUEDES". Mientras la sesion no ha
 *     respondido, `hasPermission` devuelve false para TODO (`if (!user) return
 *     false`). Sin gatear por el, la pantalla arranca acusando al usuario y
 *     luego se desdice sola. Un "no puedes" que dura 300ms sigue siendo un
 *     "no puedes".
 *
 *   - NO SE PIDE LO QUE SE SABE QUE DA 403. El caso real es `compras`: la
 *     pestaña inicial es clientes, y sin freno la pantalla pedia clientes,
 *     cobraba el 403 y pintaba el aviso de error ANTES de moverse sola a
 *     suplidores. El usuario veia una averia que no existia.
 *
 *   - Y EL MENU VA CON DOS FILAS, UNA POR MODULO. Con una sola fila `cobros`,
 *     `compras` no veria nunca el enlace aunque su pestaña le funciona. Las dos
 *     comparten `route_pattern` y `group_name`, y `new-app-sidebar.tsx`
 *     deduplica por `href` dentro del grupo (`seenHrefs`): sale UN enlace.
 */
import { crudo as crudoCrudo } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/** Orden sin reventar: ausente es FALLA, no excepcion. */
function antes(texto: string, a: string, b: string): boolean {
  const ia = texto.indexOf(a);
  const ib = texto.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
}

const PAGINA = 'src/app/dashboard/antiguedad-saldos/page.tsx';
const SQL = 'scratch/menu_antiguedad_saldos.sql';

// ─── las pestañas se ajustan al permiso ─────────────────────────────────
{
  const p = c(PAGINA);

  ok('la pagina consulta el RBAC',
    p.includes("useRbac } from '@/components/providers/rbacContext'"));

  ok('clientes se mide contra cobros y suplidores contra proveedores',
    p.includes("hasPermission('cobros', 'read')")
    && p.includes("hasPermission('proveedores', 'read')"));

  ok('la tira de pestañas se filtra por permiso',
    p.includes(".filter((t) => (t === 'clientes' ? puedeClientes : puedeSuplidores))"));
}

// ─── el `loading` del RBAC no se toma por un "no puedes" ────────────────
{
  const p = c(PAGINA);

  ok('se lee el loading del contexto',
    /loading:\s*cargandoPermisos/.test(p));

  ok('los dos permisos exigen permisos ya resueltos',
    p.includes("const puedeClientes = !cargandoPermisos && hasPermission('cobros', 'read');")
    && p.includes("const puedeSuplidores = !cargandoPermisos && hasPermission('proveedores', 'read');"));

  ok('sinAcceso NO puede ser cierto mientras se cargan permisos',
    p.includes('const sinAcceso = !cargandoPermisos && !puedeClientes && !puedeSuplidores;'));

  ok('el efecto que corrige la pestaña se abstiene mientras carga',
    /useEffect\(\(\) => \{\s*\n\s*if \(cargandoPermisos\) return;/.test(p));

  ok('mientras se resuelven permisos se enseña el esqueleto, no una acusacion',
    p.includes(') : cargandoPermisos || cargando ? ('));

  ok('la tira de pestañas no se pinta antes de saber cuales van',
    p.includes('{!cargandoPermisos && !sinAcceso && ('));
}

// ─── no se pide lo que se sabe que da 403 ───────────────────────────────
{
  const p = c(PAGINA);

  ok('existe el calculo de la pestaña permitida',
    p.includes("const permitida = tipo === 'clientes' ? puedeClientes : puedeSuplidores;"));

  ok('la carga se frena si la pestaña no esta permitida',
    p.includes('if (cargandoPermisos || !permitida) return;'));

  ok('el freno va ANTES de cargar(tipo)',
    antes(p, 'if (cargandoPermisos || !permitida) return;', '    cargar(tipo);\n  }, [tipo, cargar'));

  ok('el efecto declara sus dependencias nuevas',
    p.includes('}, [tipo, cargar, cargandoPermisos, permitida]);'));
}

// ─── quien no tiene ninguno de los dos, lo sabe ─────────────────────────
{
  const p = c(PAGINA);

  ok('hay panel honesto de sin acceso',
    p.includes('{sinAcceso ? ('));

  ok('el panel nombra los dos permisos que sirven',
    p.includes('Necesitas permiso de lectura sobre cobros o sobre proveedores.'));
}

// ─── el SQL del menu: dos filas, un solo enlace ─────────────────────────
{
  const s = c(SQL);
  const LISTA = "FROM (VALUES ('cobros'), ('proveedores')) AS m(modulo)";

  ok('el INSERT genera las dos filas de una vez',
    s.includes(LISTA));

  ok('el modulo sale de la lista, no esta escrito a mano',
    /^\s*m\.modulo,\s*$/m.test(s));

  // Las tres de abajo tambien pasaban con el SQL de UNA sola fila -- ya tenia
  // patron, guarda e order_index --, asi que no comprobaban nada. Apretadas:
  // no basta con que existan, tienen que seguir siendo UNA sola cosa
  // compartida por las DOS filas. Un copiar-y-pegar de la fila entera las
  // rompe, que es justo el error que hay que impedir.
  ok('un unico route_pattern alimenta las dos filas',
    s.split("  '/dashboard/antiguedad-saldos%',\n").length - 1 === 1
    && s.includes(LISTA));

  ok('la guarda NOT EXISTS cubre el INSERT de dos filas',
    antes(s, LISTA, 'WHERE NOT EXISTS ('));

  ok('un unico order_index calculado para las dos filas',
    s.split('COALESCE((SELECT MAX(order_index) FROM route_mappings').length - 1 === 1
    && s.includes(LISTA));

  ok('queda escrito por que el menu no sale duplicado',
    s.includes('seenHrefs'));

  ok('queda el DELETE para deshacer',
    s.includes('DELETE FROM route_mappings'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
