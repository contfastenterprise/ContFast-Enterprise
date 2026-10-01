/**
 * Las reglas del catalogo de la tienda publica (lote 231), sin React y sin base
 * de datos, para que la pagina, la portada y el banco usen LAS MISMAS.
 *
 * Nacieron al redisenar la tienda al estilo de Spree (pedido del dueno,
 * 2026-09-30). Tres cosas que antes no existian o estaban mal:
 *
 *  · ORDENAR. El boton "Filtros" del catalogo no hacia nada y los productos
 *    salian en el orden en que los devolviera la base. Ahora se ordena por
 *    relevancia (ofertas primero y luego por nombre), precio o nombre, y el
 *    precio que manda es el VIGENTE: el de oferta si lo hay. Ordenar por el de
 *    lista pondria una oferta de 500 detras de un producto de 800 que no lo es.
 *
 *  · LAS CATEGORIAS SE CUENTAN. La barra lateral solo ofrece categorias con
 *    productos: una categoria vacia es un enlace a "no se encontraron
 *    productos". Medido en PRODUCCION: Latin Doors tiene 7 con productos.
 *
 *  · EL MARCADOR SIN FOTO. Ningun producto de PRODUCCION tiene foto (0 de 87).
 *    El diseno de Spree vive de fotos, asi que donde falta se pinta la inicial
 *    del producto sobre gris, que distingue una tarjeta de otra; un icono
 *    repetido 87 veces no distingue nada.
 */
import type { StorefrontProduct, StorefrontCategory } from './productService';

export type ClaveDeOrden = 'relevancia' | 'precio-asc' | 'precio-desc' | 'nombre';

export const ORDENES: { clave: ClaveDeOrden; etiqueta: string }[] = [
  { clave: 'relevancia', etiqueta: 'Relevancia' },
  { clave: 'precio-asc', etiqueta: 'Precio: menor a mayor' },
  { clave: 'precio-desc', etiqueta: 'Precio: mayor a menor' },
  { clave: 'nombre', etiqueta: 'Nombre: A a Z' },
];

/** Lo que llega en `?orden=` lo escribe el visitante: lo desconocido es relevancia. */
export function leerOrden(valor: string | string[] | undefined): ClaveDeOrden {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return ORDENES.some((o) => o.clave === v) ? (v as ClaveDeOrden) : 'relevancia';
}

type ConPrecio = Pick<StorefrontProduct, 'price' | 'isOnSale' | 'promotionalPrice'>;

/** El precio que paga el cliente hoy: el de oferta si la hay y es de verdad (> 0). */
export function precioVigente(p: ConPrecio): number {
  return p.isOnSale && p.promotionalPrice > 0 ? p.promotionalPrice : p.price;
}

/** Hay oferta solo si el precio de oferta existe y rebaja el de lista. */
export function tieneOferta(p: ConPrecio): boolean {
  return p.isOnSale && p.promotionalPrice > 0 && p.promotionalPrice < p.price;
}

const porNombre = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });

/** Lista NUEVA (no toca la de entrada); a igualdad de precio, por nombre. */
export function ordenarProductos<T extends ConPrecio & { name: string }>(productos: T[], orden: ClaveDeOrden): T[] {
  const copia = [...productos];
  switch (orden) {
    case 'precio-asc':
      return copia.sort((a, b) => precioVigente(a) - precioVigente(b) || porNombre(a, b));
    case 'precio-desc':
      return copia.sort((a, b) => precioVigente(b) - precioVigente(a) || porNombre(a, b));
    case 'nombre':
      return copia.sort(porNombre);
    default:
      return copia.sort((a, b) => Number(tieneOferta(b)) - Number(tieneOferta(a)) || porNombre(a, b));
  }
}

/** Cuantos productos hay en cada categoria (los sin categoria no cuentan). */
export function contarPorCategoria(productos: Pick<StorefrontProduct, 'categoryId'>[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const p of productos) if (p.categoryId) cuenta[p.categoryId] = (cuenta[p.categoryId] ?? 0) + 1;
  return cuenta;
}

/** Las categorias que tienen productos, con cuantos, en orden de mas a menos. */
export function categoriasConProductos(
  categorias: StorefrontCategory[],
  cuenta: Record<string, number>,
): (StorefrontCategory & { cantidad: number })[] {
  const conProductos: (StorefrontCategory & { cantidad: number })[] = [];
  for (const c of categorias) {
    const cantidad = cuenta[c.id] ?? 0;
    if (cantidad > 0) conProductos.push({ ...c, cantidad });
  }
  return conProductos.sort((a, b) => b.cantidad - a.cantidad || porNombre(a, b));
}

/** "Puerta Roble 90*210" -> "PR"; una sola palabra, su primera letra. */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const letras = palabras.slice(0, 2).map((w) => w[0].toLocaleUpperCase('es'));
  return letras.join('') || '·';
}

/** "RD$ 1,234.50", como lo escribia la tienda. */
export function precioDeTienda(n: number): string {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Los enlaces del catalogo conservan lo que no cambian (categoria, busqueda, orden). */
export function enlaceDelCatalogo(
  empresaSlug: string,
  actual: { categoria?: string; q?: string; orden?: ClaveDeOrden },
  cambio: { categoria?: string | null; orden?: ClaveDeOrden },
): string {
  const params = new URLSearchParams();
  const categoria = cambio.categoria === undefined ? actual.categoria : cambio.categoria;
  const orden = cambio.orden ?? actual.orden;
  if (categoria) params.set('categoria', categoria);
  if (actual.q) params.set('q', actual.q);
  if (orden && orden !== 'relevancia') params.set('orden', orden);
  const s = params.toString();
  return `/${empresaSlug}/productos${s ? `?${s}` : ''}`;
}
