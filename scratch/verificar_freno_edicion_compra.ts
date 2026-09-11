/**
 * Editar o eliminar una compra cuya mercancia ya salio.
 *
 * `PUT /api/v1/expenses/[id]` estaba bien construido: solo admin/sistemas,
 * bloquea si hay pagos aplicados o cheque de garantia cobrado, bloquea si el
 * periodo contable original esta cerrado, y no BORRA nada -- revierte el
 * asiento y los movimientos de inventario y vuelve a emitirlos.
 *
 * Faltaba un caso, y es el que mas duele: que la mercancia de esa compra YA SE
 * HAYA VENDIDO.
 *
 *   - `addStock` no tiene freno de negativo. Hace `level.quantity + quantity` y
 *     escribe el resultado. Sus propios comentarios lo dan por hecho al hablar
 *     del costo promedio: "una existencia en rojo... una venta que dejo el
 *     nivel bajo cero".
 *
 *   - Asi que revertir la entrada dejaba el almacen en negativo, en silencio.
 *
 *   - Y el negativo no es el problema, es la SEÑAL: significa que esas unidades
 *     salieron en facturas valoradas con el costo promedio que metio esta
 *     compra. Ese costo ya esta dentro del COGS de comprobantes emitidos, y
 *     editar la compra hacia atras no lo recalcula -- ni debe (ver el
 *     comentario de P1-12 en la propia funcion). Corregir la compra dejaba el
 *     asiento de la compra bien y el de esas ventas mal, sin nada que avisara.
 *
 * El segundo cambio es de TEXTO y tambien importa: el periodo cerrado ya
 * frenaba la edicion, pero el mensaje solo hablaba de contabilidad. El momento
 * en que alguien lee "abralo en Periodos" es exactamente el momento en que hay
 * que decirle que si esa compra ya se declaro en el Formato 606, reabrir el
 * periodo no arregla nada: lo que toca es una rectificativa.
 */
import { crudo as crudoCrudo } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const RUTA = 'src/app/api/v1/expenses/[id]/route.ts';
const src = c(RUTA);

// El cuerpo de la funcion que revierte el inventario, acotado: el fichero pasa
// de 50 KB y tiene mas de un sitio donde se mueve existencia.
const i = src.indexOf('async function revertirMovimientosInventario');
const j = i !== -1 ? src.indexOf('\n}\n', i) : -1;
const rev = i !== -1 && j !== -1 ? src.slice(i, j) : '';

const veces = (s: string, t: string): number => s.split(t).length - 1;

// ─── el freno de existencia consumida ───────────────────────────────────
{
  ok('el freno existe, con su codigo propio',
    rev.includes("err.code = 'STOCK_YA_CONSUMIDO'"));

  ok('responde 409, no 500',
    rev.includes("err.code = 'STOCK_YA_CONSUMIDO'") && rev.includes('err.status = 409;'));

  // Si se comprobara despues, ya se habria movido la existencia de otros
  // productos de la misma compra y el fallo dejaria el almacen a medias.
  const iFreno = rev.indexOf('STOCK_YA_CONSUMIDO');
  const iMueve = rev.indexOf('await addStock(');
  ok('se comprueba ANTES de mover nada',
    iFreno !== -1 && iMueve !== -1 && iFreno < iMueve);

  // Sin bloqueo, entre la comprobacion y el movimiento cabe una venta.
  ok('lee el nivel con la fila bloqueada',
    rev.includes(".for('update')"));

  ok('los productos sin control de existencia se saltan',
    rev.includes('llevaInventario(companyId, r.productId, tx)'));

  // Un "no se puede" sin cifras obliga a adivinar cual producto y cuanto falta.
  ok('el mensaje nombra producto, almacen y las tres cifras',
    rev.includes('prod?.name') && rev.includes('alm?.name')
    && rev.includes('${quedaria}') && rev.includes('${actual}') && rev.includes('${r.cantidad}'));

  // La misma funcion la usan PUT y DELETE.
  ok('el verbo del mensaje distingue editar de eliminar',
    rev.includes("startsWith('eliminaci')"));
}

// ─── el aviso del 606 en el periodo cerrado ─────────────────────────────
{
  ok('las DOS salidas (editar y eliminar) nombran el 606',
    veces(src, 'Formato 606') === 2);

  ok('y dicen cual es el camino correcto',
    veces(src, 'rectificativa del 606') === 2
    && veces(src, 'nota de crédito/débito del suplidor') === 2);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
