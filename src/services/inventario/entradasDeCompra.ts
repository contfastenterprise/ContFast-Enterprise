/**
 * Lo que una compra mete en el almacen, y lo que cambia al editarla.
 *
 * POR QUE ESTE FICHERO (lote 150)
 * -------------------------------
 * Editar una compra revertia TODAS sus entradas de inventario y las volvia a
 * meter con las lineas nuevas. Dos consecuencias, medidas el 2026-09-16:
 *
 *   1. Antes del freno del 11/09 (`c2525cb`), editar E310000013249 llevo cuatro
 *      productos de Latin Doors a existencia negativa (hasta -94) entre el
 *      reverso y la reentrada. El kardex conserva esas lineas en rojo.
 *   2. Con el freno puesto, el freno miraba el reverso ENTERO y no lo que la
 *      edicion vuelve a meter: 6 de las 7 compras con inventario de PRODUCCION
 *      no se podian editar en nada -- ni la descripcion, ni la fecha, ni el
 *      NCF -- porque parte de su mercancia ya se vendio.
 *
 * Decidido por el dueño el 2026-09-16: si la edicion no cambia producto,
 * almacen, cantidad ni costo, el kardex NO se toca (ni reverso, ni reentrada,
 * ni promedio movido). Si cambia, se niega solo cuando lo NETO dejaria la
 * existencia bajo cero.
 *
 * Aqui no hay base de datos: es la comparacion y la cuenta. La ruta lee y
 * escribe.
 */
import { HOLGURA, aCantidad } from './existencia';

/** Una entrada de mercancia de una compra: cuanto de que producto a que almacen, y a que costo. */
export interface EntradaDeCompra {
  productId: string;
  warehouseId: string;
  cantidad: number;
  costo: number;
}

/** Lo que llega de la pantalla o de `expense_lines`: decimales como texto o numero. */
export interface LineaConProducto {
  productId?: string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
}

export const claveDeNivel = (productId: string, warehouseId: string) => `${productId}|${warehouseId}`;

/**
 * Las lineas que mueven existencia, con la MISMA condicion con la que la ruta
 * llama a `addStock`: con producto, con almacen y el producto con control de
 * existencia. Si esta condicion y la de la ruta se separan, la comparacion
 * compara otra cosa que lo que se escribe.
 */
export function entradasDeLineas(
  lineas: readonly LineaConProducto[] | null | undefined,
  warehouseId: string | null | undefined,
  sinInventario: ReadonlySet<string>,
): EntradaDeCompra[] {
  if (!warehouseId) return [];
  return (lineas ?? [])
    .filter((l): l is LineaConProducto & { productId: string } => !!l.productId && !sinInventario.has(l.productId))
    .map((l) => ({ productId: l.productId, warehouseId, cantidad: aCantidad(l.quantity), costo: aCantidad(l.unitCost) }));
}

/** Cuanto entra por nivel (producto + almacen). */
export function cantidadPorNivel(
  entradas: readonly { productId: string; warehouseId: string; cantidad: number }[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const e of entradas) {
    const clave = claveDeNivel(e.productId, e.warehouseId);
    mapa.set(clave, (mapa.get(clave) ?? 0) + e.cantidad);
  }
  return mapa;
}

//  `expense_lines` guarda cantidad y costo con 2 decimales; la pantalla puede
//  mandar mas. Se comparan a esa escala: lo que se va a guardar, no lo que se
//  tecleo.
const aCentesimas = (n: number) => Math.round(n * 100);

/**
 * ¿La edicion deja el kardex exactamente como esta?
 *
 * Tienen que cumplirse las dos cosas:
 *   - lo que HOY esta vivo en el kardex (entradas de la compra no revertidas),
 *     por nivel, es lo mismo que meterian las lineas nuevas; y
 *   - las lineas de antes y las de despues traen los mismos productos, almacen,
 *     cantidades y costos. Sin esto, cambiar solo el costo pasaria por "sin
 *     cambios" y el costo promedio se quedaria con el viejo.
 *
 * De las lineas de antes solo cuentan las que movieron existencia (su nivel
 * esta vivo en el kardex): un servicio en la compra no deja nada que comparar.
 * Ante cualquier duda contesta que NO, y la edicion va por el camino de siempre
 * (reverso y reentrada, con el freno neto).
 */
export function kardexSinCambios(
  vivoPorNivel: ReadonlyMap<string, number>,
  antes: readonly EntradaDeCompra[],
  despues: readonly EntradaDeCompra[],
): boolean {
  const nuevo = cantidadPorNivel(despues);
  //  Mismo numero de niveles y cada nivel vivo con la misma cantidad. Las dos
  //  guardas se cubren entre si (con la firma de abajo exigiendo que todo nivel
  //  nuevo este vivo): quitando UNA el resultado no cambia, quitando las DOS un
  //  nivel vivo que ya no esta en las lineas pasaria por "sin cambios". Medido
  //  en el lote 150: cada mutante suelto sobrevive, el doble muere.
  if (nuevo.size !== vivoPorNivel.size) return false;
  for (const [clave, cantidad] of vivoPorNivel) {
    const otra = nuevo.get(clave);
    if (otra === undefined || Math.abs(otra - cantidad) > HOLGURA) return false;
  }

  const firma = (e: EntradaDeCompra) =>
    `${claveDeNivel(e.productId, e.warehouseId)}|${aCentesimas(e.cantidad)}|${aCentesimas(e.costo)}`;
  const a = antes.filter((e) => vivoPorNivel.has(claveDeNivel(e.productId, e.warehouseId))).map(firma).sort();
  const b = despues.map(firma).sort();
  return a.length === b.length && a.every((f, i) => f === b[i]);
}

/**
 * La existencia que queda en un nivel tras la edicion: lo que hay, menos lo que
 * se revierte, mas lo que la edicion vuelve a meter en ese mismo nivel. Al
 * eliminar la compra no vuelve nada.
 */
export function existenciaTrasEditar(actual: number, seRevierte: number, vuelveAEntrar: number): number {
  return actual - seRevierte + vuelveAEntrar;
}

/** Bajo cero, con la holgura de coma flotante de siempre. */
export const quedaEnRojo = (existencia: number) => existencia < -HOLGURA;
