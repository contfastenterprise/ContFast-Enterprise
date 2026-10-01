/**
 * La cotizacion del visitante (lote 233). Decision del dueno (2026-09-30): la
 * tienda NO tiene cuentas; el visitante ve productos y precios, los anade a
 * un carrito y ese carrito es SU cotizacion — no se envia a ningun sitio.
 *
 * Lo que decide esta regla, y por que vive aqui y no en el componente:
 *
 *  · EL PRECIO SALE DEL CATALOGO, no del navegador. El carrito guardaba el
 *    precio del momento de anadir: si despues cambiaba, la cotizacion ensenaba
 *    el viejo, y cualquiera podia editarlo a mano en `localStorage`. Del
 *    carrito solo se fia el producto y la cantidad.
 *  · Lo que ya no se vende NO entra en el total: se avisa como "ya no
 *    disponible", con su nombre guardado, para que se pueda quitar.
 *  · Las cantidades se validan: entero >= 1; un renglon roto no tumba la lista.
 *  · ITBIS al 18 % sobre el subtotal, como la tienda decia; los importes se
 *    redondean a centavos para que subtotal + ITBIS = total al centavo.
 */
export type RenglonGuardado = { productId: string; quantity: number; name?: string };

export type ProductoCotizable = { id: string; name: string; precio: number; imageUrl: string | null; slug: string };

export type Renglon = { productId: string; nombre: string; precio: number; cantidad: number; importe: number; imageUrl: string | null; slug: string };

export type Cotizacion = {
  renglones: Renglon[];
  noDisponibles: { productId: string; nombre: string }[];
  unidades: number;
  subtotal: number;
  itbis: number;
  total: number;
};

export const TASA_ITBIS = 0.18;
export const CLAVE_CARRITO = 'storefront_cart';

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo guardado en el navegador, validado. Basura -> lista vacia; repetidos se suman. */
export function leerCarrito(crudo: string | null): RenglonGuardado[] {
  if (!crudo) return [];
  let v: unknown;
  try { v = JSON.parse(crudo); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const porProducto = new Map<string, RenglonGuardado>();
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const r = x as { productId?: unknown; quantity?: unknown; name?: unknown };
    if (typeof r.productId !== 'string' || !r.productId) continue;
    const cantidad = typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? Math.floor(r.quantity) : 0;
    if (cantidad < 1) continue;
    const previo = porProducto.get(r.productId);
    porProducto.set(r.productId, {
      productId: r.productId,
      quantity: (previo?.quantity ?? 0) + cantidad,
      name: previo?.name ?? (typeof r.name === 'string' ? r.name : undefined),
    });
  }
  return [...porProducto.values()];
}

/** La cotizacion con los precios de HOY. */
export function armarCotizacion(carrito: RenglonGuardado[], catalogo: ProductoCotizable[]): Cotizacion {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const renglones: Renglon[] = [];
  const noDisponibles: { productId: string; nombre: string }[] = [];
  for (const r of carrito) {
    const p = porId.get(r.productId);
    if (!p) { noDisponibles.push({ productId: r.productId, nombre: r.name || 'Producto' }); continue; }
    renglones.push({
      productId: p.id, nombre: p.name, precio: p.precio, cantidad: r.quantity,
      importe: centavos(p.precio * r.quantity), imageUrl: p.imageUrl, slug: p.slug,
    });
  }
  const subtotal = centavos(renglones.reduce((a, r) => a + r.importe, 0));
  const itbis = centavos(subtotal * TASA_ITBIS);
  return {
    renglones, noDisponibles,
    unidades: renglones.reduce((a, r) => a + r.cantidad, 0),
    subtotal, itbis, total: centavos(subtotal + itbis),
  };
}

/** Cambia la cantidad (o quita si < 1). Lista NUEVA. */
export function cambiarCantidad(carrito: RenglonGuardado[], productId: string, cantidad: number): RenglonGuardado[] {
  const n = Math.floor(cantidad);
  return n < 1
    ? carrito.filter((r) => r.productId !== productId)
    : carrito.map((r) => (r.productId === productId ? { ...r, quantity: n } : r));
}
