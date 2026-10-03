/**
 * Lote 261: cambiar la tasa del dolar desde Compras y Facturacion.
 *
 * Pedido del dueño (2026-10-03): *"debiera darme la opcion de cambiar la tasa desde compra y
 * facturacion para facilitar el cambio de precio"*. Elegido por el: al guardar la tasa desde esas
 * pantallas, los precios de TODOS los productos en dolares se aplican en el acto, sin la
 * confirmacion de Productos; y la factura sigue cobrando el precio del CATALOGO (no dolares x tasa
 * en vivo), que con esto queda al dia.
 *
 * Lo que queda a cargo de la pantalla, y vive aqui puro para que un banco lo pueda ejecutar:
 *
 *   · las LINEAS YA ESCRITAS. Cambiar la tasa con una compra o una factura a medio hacer no puede
 *     dejar esas lineas con la tasa vieja sin decir nada -- pero tampoco puede pisar un importe que
 *     alguien escribio a mano (en una compra manda la factura del suplidor; en una venta, un precio
 *     negociado). La regla: se actualiza la linea cuyo importe sigue siendo EXACTAMENTE el que puso
 *     el sistema con lo de antes; la que no, se deja.
 *   · el mensaje que dice que paso.
 */
import { costoParaCompra, enPesos, redondear } from './preciosEnDolares';

/** Lo que contesta el servidor al guardar y aplicar. */
export interface ResultadoDelCambio {
  /** Productos que cambiaron de precio. */
  aplicados: number;
  /** Productos que siguen al dolar (cambien o no). */
  atados: number;
}

/** El aviso al guardar: la tasa y cuantos precios cambiaron. */
export function mensajeDelCambio(tasa: number, r: ResultadoDelCambio): string {
  const guardada = `Tasa guardada: RD$ ${enPesos(tasa)} por dólar.`;
  if (r.atados === 0) return `${guardada} No hay productos en dólares.`;
  if (r.aplicados === 0) return `${guardada} Ningún precio cambió.`;
  return r.aplicados === 1
    ? `${guardada} 1 producto cambió de precio.`
    : `${guardada} ${r.aplicados} productos cambiaron de precio.`;
}

/** Dos importes en pesos son el mismo si coinciden al centavo. */
const mismoImporte = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

// ─── Compras ──────────────────────────────────────────────────────────────────

export interface LineaDeCompra {
  productId: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  itbis: number;
  total: number;
}

/**
 * Las lineas de una compra a medio hacer, con la tasa nueva.
 *
 * Cambia la de un producto en dolares cuyo costo es el que puso el sistema con la tasa ANTERIOR
 * (`costo en dolares x tasa vieja`, al centavo). Su subtotal, ITBIS y total se rehacen como al
 * elegir el producto: ITBIS del 18 %, o 0 si la compra va sin ITBIS. Sin tasa anterior no se sabe
 * que puso el sistema, y no se toca nada.
 */
export function lineasDeCompraConTasa<L extends LineaDeCompra>(
  lineas: readonly L[],
  costosUsd: ReadonlyMap<string, number>,
  anterior: number | null,
  nueva: number,
  sinItbis: boolean,
): { lineas: L[]; cambiadas: number } {
  let cambiadas = 0;
  const resultado = lineas.map((l) => {
    const usd = l.productId ? costosUsd.get(l.productId) : undefined;
    if (!usd || !anterior) return l;
    if (!mismoImporte(l.unitCost, costoParaCompra(0, usd, anterior))) return l;
    const unitCost = costoParaCompra(0, usd, nueva);
    if (mismoImporte(unitCost, l.unitCost)) return l;
    const subtotal = redondear(l.quantity * unitCost);
    const itbis = sinItbis ? 0 : redondear(subtotal * 0.18);
    cambiadas += 1;
    return { ...l, unitCost, subtotal, itbis, total: redondear(subtotal + itbis) };
  });
  return { lineas: resultado, cambiadas };
}

// ─── Facturacion ──────────────────────────────────────────────────────────────

export type NivelDePrecio = 'base' | 'consumidor' | 'proveedor' | 'mayorista';

export interface PreciosDelProducto {
  price?: unknown;
  priceConsumidor?: unknown;
  priceProveedor?: unknown;
  priceMayorista?: unknown;
}

const n = (v: unknown) => parseFloat(String(v ?? '')) || 0;

/**
 * El precio de un nivel, como lo pone la pantalla de facturas al elegir el producto: el del nivel,
 * o el precio base si el del nivel esta en cero. Sin nivel, consumidor.
 */
export function precioDeNivel(p: PreciosDelProducto, nivel: NivelDePrecio | undefined): number {
  switch (nivel ?? 'consumidor') {
    case 'base': return n(p.price);
    case 'proveedor': return n(p.priceProveedor) || n(p.price);
    case 'mayorista': return n(p.priceMayorista) || n(p.price);
    default: return n(p.priceConsumidor) || n(p.price);
  }
}

export interface LineaDeFactura {
  productId?: string;
  priceTier?: NivelDePrecio;
  unitPrice: number;
}

/**
 * Las lineas de una factura a medio hacer, con el catalogo ya puesto al dia.
 *
 * Cambia la linea cuyo precio es el de su nivel en el catalogo ANTERIOR (al centavo) y que en el
 * nuevo vale otra cosa. Un precio cambiado a mano se deja: la factura cobra lo que se acordo.
 */
export function lineasDeFacturaConPrecios<L extends LineaDeFactura>(
  lineas: readonly L[],
  antes: ReadonlyMap<string, PreciosDelProducto>,
  despues: ReadonlyMap<string, PreciosDelProducto>,
): { lineas: L[]; cambiadas: number } {
  let cambiadas = 0;
  const resultado = lineas.map((l) => {
    const viejo = l.productId ? antes.get(l.productId) : undefined;
    const nuevo = l.productId ? despues.get(l.productId) : undefined;
    if (!viejo || !nuevo) return l;
    if (!mismoImporte(l.unitPrice, precioDeNivel(viejo, l.priceTier))) return l;
    const unitPrice = precioDeNivel(nuevo, l.priceTier);
    if (mismoImporte(unitPrice, l.unitPrice)) return l;
    cambiadas += 1;
    return { ...l, unitPrice };
  });
  return { lineas: resultado, cambiadas };
}
