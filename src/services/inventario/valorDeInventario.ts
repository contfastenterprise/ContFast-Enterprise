/**
 * LOTE 291: cuanto vale el inventario -- la tarjeta "Valor de Inventario" de Productos.
 *
 * QUE PASABA
 * ----------
 * La tarjeta sumaba `products.cost` de la PAGINA visible (15 productos) y sin multiplicar por la
 * existencia: un producto con 40 unidades contaba lo mismo que uno con ninguna, y cambiar de pagina
 * cambiaba "el valor del inventario". La cifra no era de nada.
 *
 * QUE COSTO
 * ---------
 * El COSTO PROMEDIO del kardex (`inventory_levels.average_cost`, por producto, almacen y modo). Es el
 * que asienta la contabilidad: el conduce saca la mercancia a ese costo (`deductStock` ->
 * `deliveryRepository`, costo de venta) y la compra la mete a ese costo (`addStock`). Con el costo de
 * catalogo (`products.cost`, el de reposicion, el que mueve la tasa del dolar) la tarjeta diria otra
 * cosa que la cuenta de Inventario del mayor.
 *
 * Lo que eso deja a la vista, y es a proposito: un nivel con existencia y promedio 0 (los conteos
 * fisicos del lote 121, que entraron sin costo) vale 0 aqui. No se rellena con el costo de catalogo:
 * como valorar un sobrante de conteo es una decision contable (seccion 8, "costo de venta 0"), y
 * rellenarlo aqui haria que la tarjeta y el mayor dijeran cosas distintas. Se CUENTA (`sinCosto`) para
 * que la pantalla lo diga.
 *
 * QUE EXISTENCIA
 * --------------
 * Solo la POSITIVA. Una existencia negativa no es mercancia que valga menos: es un descuadre del
 * kardex (salio mas de lo que entro). Restarla le quitaria valor a lo que si esta en el estante; se
 * cuenta (`negativos`) y no suma. Medido el 2026-10-04: ningun nivel negativo en Latin Doors.
 *
 * Los productos que no llevan inventario (servicios) y los borrados no cuentan, aunque les quede una
 * fila en `inventory_levels`. La ruta ya los filtra en la consulta; aqui se repite para que la regla
 * sea entera en un sitio y se pueda ejecutar sin base.
 *
 * Sin `@/db`: es aritmetica, y el banco la ejecuta.
 */
import { aCantidad, HOLGURA } from './existencia';
import { roundMoney } from '@/utils/calculos';

/** Un nivel de almacen con lo necesario para valorarlo. Los decimales llegan como texto. */
export interface NivelParaValorar {
  productId?: string;
  quantity?: number | string | null;
  averageCost?: number | string | null;
  /** Los de servicio no tienen existencia que valorar. */
  tracksInventory?: boolean | null;
  /** Un producto borrado no esta en el catalogo. */
  deletedAt?: Date | string | null;
}

export interface ValorDelInventario {
  /** Suma de existencia x costo promedio, redondeada a centavos. */
  valor: number;
  /** Niveles con existencia positiva que entraron en la suma. */
  niveles: number;
  /** De esos, cuantos tienen costo promedio 0 (valen 0 en la suma). */
  sinCosto: number;
  /** Niveles con existencia negativa: no suman, se cuentan. */
  negativos: number;
}

export function valorDelInventario(niveles: readonly NivelParaValorar[]): ValorDelInventario {
  let valor = 0;
  let contados = 0;
  let sinCosto = 0;
  let negativos = 0;
  for (const n of niveles) {
    if (n.tracksInventory === false) continue;
    if (n.deletedAt) continue;
    const cantidad = aCantidad(n.quantity);
    //  Mutante equivalente, anotado: quitar el `continue` de la negativa no cambia nada, porque la
    //  linea siguiente tambien la deja fuera. Son dos guardas a proposito: contar, y no sumar.
    if (cantidad < -HOLGURA) { negativos++; continue; }
    if (cantidad <= HOLGURA) continue;
    const costo = aCantidad(n.averageCost);
    contados++;
    if (costo <= HOLGURA) { sinCosto++; continue; }
    valor += cantidad * costo;
  }
  return { valor: roundMoney(valor), niveles: contados, sinCosto, negativos };
}
