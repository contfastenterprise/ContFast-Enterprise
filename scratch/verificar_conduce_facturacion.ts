/**
 * El conduce que no veia nadie.
 *
 * `DEFAULT_ROLE_PERMISSIONS` concede `conduce:read` y `conduce:write` a un solo
 * rol: `facturacion`. Y `buildSidebar` escondia `/dashboard/delivery-notes`
 * exactamente a ese rol, por estar en la lista de "facturacion no puede ver
 * Inventario". Las dos reglas se anulaban, y el resultado no era un error sino
 * una pantalla ausente: Conduces no lo veia NINGUN rol fuera de `sistemas` y
 * `administracion`, que pasan por encima de todo.
 *
 * El conduce no es inventario. Es el documento de ENTREGA de una factura; que
 * el menu lo guarde en el grupo 'Inventario' es una decision de colocacion, no
 * una de permisos. Por eso la excepcion mira el MODULO -- que es lo que de
 * verdad identifica al conduce -- y ademas la ruta, por si la fila del menu
 * llega sin modulo.
 *
 * Este banco defiende la forma del arreglo. Lo que defiende su COMPORTAMIENTO
 * es src/tests/menuLateral.vitest.ts, que llama a `buildSidebar` de verdad: una
 * contradiccion entre dos reglas no se ve leyendo el texto de una sola.
 */
import { crudo as crudoCrudo, bloque, sinComentarios } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const HELPERS = 'src/utils/rbacHelpers.ts';
const MARCA = '// Restricción facturacion: no puede ver Inventario';

// El bloque que importa es el SEGUNDO `if (cleanRole === 'facturacion')`: el
// primero es el de Inicio y Comprobantes Fiscales, y no se toca.
const inv = bloque(c(HELPERS), MARCA);
// La misma zona, sin comentarios. OJO: no se puede sacar de `f(HELPERS)` --
// `fuente()` quita los comentarios ANTES, y el marcador que delimita el bloque
// ES un comentario, asi que `bloque()` no encontraria nada y devolveria vacio.
// Primero se recorta sobre el crudo, y despues se limpia.
const invCodigo = sinComentarios(inv);

// ─── la excepcion existe y mira las dos cosas ───────────────────────────
{
  ok('se calcula `esConduce` dentro del bloque de inventario',
    inv.includes('const esConduce'));

  ok('lo identifica por MODULO, que es lo que de verdad es un conduce',
    inv.includes("m.module === 'conduce'"));

  // Sin la bandera `s`: el `target` del proyecto es anterior a es2018 y `tsc`
  // la rechaza (TS1501). Tampoco hacia falta -- no hay ningun `.` en el
  // patron, y `[^;]` ya cruza saltos de linea por su cuenta.
  ok('y tambien por RUTA, dentro del propio calculo de esConduce',
    /const esConduce\s*=[^;]*?\/dashboard\/delivery-notes/.test(inv));
}

// ─── la exclusion de inventario queda condicionada ──────────────────────
{
  ok('la exclusion solo se aplica si NO es conduce',
    inv.includes('!esConduce &&'));

  // Contar ocurrencias no servia: antes tambien habia UNA (la de la lista). Lo
  // que hay que afirmar es DONDE esta -- solo en el calculo de `esConduce`,
  // nunca ya en la condicion que excluye.
  ok('los conduces ya NO figuran en la lista de exclusiones',
    invCodigo.includes('!esConduce &&')
    && !invCodigo.slice(invCodigo.indexOf('!esConduce &&')).includes('/dashboard/delivery-notes'));
}

// ─── y el inventario de verdad sigue cerrado ────────────────────────────
{
  // Esta pasaba tambien ANTES -- las tres exclusiones ya estaban --, asi que
  // no comprobaba nada. Apretada: no basta con que existan, tienen que colgar
  // de la condicion nueva. Si alguien quita el `!esConduce` o saca las tres de
  // ahi, se cae.
  const tras = inv.includes('!esConduce &&') ? inv.slice(inv.indexOf('!esConduce &&')) : '';

  ok('inventory, products y warehouses cuelgan del `!esConduce &&`',
    tras.includes("'/dashboard/inventory'")
    && tras.includes("'/dashboard/products'")
    && tras.includes("'/dashboard/warehouses'")
    && tras.includes("m.groupName === 'Inventario'"));

  ok('el grupo tampoco puede volver a atrapar al conduce',
    inv.includes('!esConduce &&')
    && inv.indexOf('!esConduce &&') < inv.indexOf("m.groupName === 'Inventario'"));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
