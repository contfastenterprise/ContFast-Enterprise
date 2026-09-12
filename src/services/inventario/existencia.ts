/**
 * ¿Alcanza la existencia? La regla, en un solo sitio.
 *
 * POR QUE ESTE FICHERO
 * --------------------
 * La misma pregunta se respondia en TRES sitios con TRES reglas distintas:
 *
 *   1. `inventoryService.alcanzaLaExistencia` -- la buena. Corregida ya dos
 *      veces (F1-04 y el arreglo de lineas repetidas), con el comentario de
 *      P2-28 avisando de que una copia es "una copia condenada a quedarse
 *      atras".
 *   2. El aviso en vivo de la pantalla de facturas, que la reescribia a mano.
 *   3. El selector de producto, que se habia quedado en la version ANTERIOR a
 *      F1-04: `minStock > 0 && cantidad <= minStock`. Con el minimo en 0 -que es
 *      el valor por defecto- un producto con CERO unidades pasaba sin avisar, y
 *      con minimo puesto bloqueaba en duro un producto que la propia pantalla de
 *      facturas dice que se puede facturar.
 *
 * Aqui no hay base de datos ni `db`: es aritmetica. Por eso lo puede importar un
 * componente de cliente igual que el servicio del servidor, que es justo lo que
 * hacia falta para que el desplegable y el conduce decidan lo mismo.
 *
 * QUE ES "DISPONIBLE"
 * -------------------
 * Lo que se puede sacar de un almacen NO es lo que hay: es lo que hay menos el
 * minimo que hay que dejar puesto. Con 20 en almacen y un minimo de 10, lo
 * disponible son 10, no 20.
 */

/**
 * Las cantidades son decimal(15,4). Se compara con una holgura minima para que
 * restar una cantidad exacta no falle por ruido de coma flotante: 3 - 3 puede
 * dar -4.44e-16, que sin holgura se lee como "falta existencia".
 */
export const HOLGURA = 1e-6;

/** Lo que llega de la base o de la API: decimales como texto, o ausentes. */
export interface NivelDeAlmacen {
  quantity?: number | string | null;
  minStock?: number | string | null;
}

/** Un decimal que puede venir como texto, como numero, o no venir. */
export function aCantidad(valor: number | string | null | undefined): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lo que se puede sacar. Sin nivel -el producto nunca ha entrado a ese almacen-
 * son cero: no hay fila en `inventory_levels`, no hay nada que sacar.
 *
 * Puede salir NEGATIVO, y esta bien: significa que la existencia ya esta por
 * debajo del minimo. Quien lo use decide si eso avisa o frena.
 */
export function disponible(nivel: NivelDeAlmacen | null | undefined): number {
  if (!nivel) return 0;
  return aCantidad(nivel.quantity) - aCantidad(nivel.minStock);
}

/**
 * La regla de siempre, con los tres numeros sueltos.
 *
 * Se conserva con esta firma porque es la que usa el servidor, que ya tiene la
 * existencia y el minimo por separado en la mano.
 */
export function alcanzaLaExistencia(existencia: number, minimo: number, cantidadPedida: number): boolean {
  return existencia - cantidadPedida >= minimo - HOLGURA;
}

/** Lo mismo, cuando lo que se tiene delante es el nivel entero. */
export function alcanza(nivel: NivelDeAlmacen | null | undefined, cantidadPedida: number): boolean {
  return disponible(nivel) - cantidadPedida >= -HOLGURA;
}

/**
 * ¿Queda ALGO que sacar?
 *
 * Es la unica pregunta que se puede hacer antes de saber cuanto se va a pedir --
 * el caso del selector de producto, donde la linea todavia no tiene cantidad.
 * No sustituye a `alcanza`: que quede algo no quiere decir que alcance para lo
 * que se va a pedir.
 */
export function quedaAlgo(nivel: NivelDeAlmacen | null | undefined): boolean {
  return disponible(nivel) > HOLGURA;
}
