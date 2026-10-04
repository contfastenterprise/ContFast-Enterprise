/**
 * Lote 265: el porcentaje de ganancia es un MARGEN SOBRE EL PRECIO DE VENTA.
 *
 * Decision del dueño (2026-10-03), revisando el calculo de la factura: *"usa la formula costo / 0,75
 * = 133,33. aplicalo en todos los lugares"*. Hasta ahora los precios eran un RECARGO sobre el costo
 * (`costo x 1,25`): con costo 100, precio 125, que es un 20 % de lo que se vende, no un 25 %. Ahora
 * `precio = costo / (1 - margen)`: con costo 100 y margen 25 %, 133,33, y la ganancia (33,33) es el
 * 25 % del precio.
 *
 * Los cuatro niveles conservan sus porcentajes (25, 20, 15 y 10), ahora sobre la venta. Una sola
 * regla para el formulario de productos y para "Precios en dolares": si cada uno la escribiera a su
 * manera, el mismo costo daria dos precios distintos segun por donde se entrara.
 *
 * Los precios se guardan SIN ITBIS, como siempre: el ITBIS lo suma la factura encima.
 */
export const MARGENES_SOBRE_VENTA = {
  price: 0.25,
  priceConsumidor: 0.2,
  priceMayorista: 0.15,
  priceProveedor: 0.1,
} as const;

export type ClaveDePrecio = keyof typeof MARGENES_SOBRE_VENTA;
export const CLAVES_DE_PRECIO = Object.keys(MARGENES_SOBRE_VENTA) as ClaveDePrecio[];

const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** El precio que deja `margen` (fraccion: 0,25 = 25 %) de lo que se vende. Redondeado al centavo. */
export function precioConMargen(costo: number, margen: number): number {
  if (!(costo > 0) || !(margen >= 0) || margen >= 1) return 0;
  return centavos(costo / (1 - margen));
}

/** Los cuatro precios de un costo, con los margenes de fabrica. */
export function preciosDesdeCosto(costo: number): Record<ClaveDePrecio, number> {
  return {
    price: precioConMargen(costo, MARGENES_SOBRE_VENTA.price),
    priceConsumidor: precioConMargen(costo, MARGENES_SOBRE_VENTA.priceConsumidor),
    priceMayorista: precioConMargen(costo, MARGENES_SOBRE_VENTA.priceMayorista),
    priceProveedor: precioConMargen(costo, MARGENES_SOBRE_VENTA.priceProveedor),
  };
}
