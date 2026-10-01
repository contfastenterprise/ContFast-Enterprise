/**
 * Los favoritos de la tienda publica (lote 231): el corazon de Spree.
 *
 * Decision del dueno (2026-09-30): se guardan en el NAVEGADOR de cada
 * visitante, sin cuenta. Por eso:
 *
 *  · la clave lleva la EMPRESA: las seis tiendas viven en el mismo dominio y
 *    comparten `localStorage`; sin ella, lo anclado en una saldria en la otra
 *    (como identificadores que alli no existen);
 *  · lo leido se VALIDA: es texto que cualquiera puede escribir a mano, asi que
 *    solo pasan identificadores con forma de UUID, sin repetir. Leer nunca
 *    puede romper la pagina;
 *  · un favorito cuyo producto ya no esta activo NO se borra: simplemente no se
 *    ensena. Si el producto vuelve, vuelve con el (el criterio de los anclados
 *    del menu, lote 191).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EVENTO_FAVORITOS = 'favoritos_updated';

export function claveDeFavoritos(empresaSlug: string): string {
  return `storefront_favoritos:${empresaSlug}`;
}

/** Lo guardado, validado. `null` o basura dan lista vacia. */
export function leerFavoritos(crudo: string | null): string[] {
  if (!crudo) return [];
  try {
    const v: unknown = JSON.parse(crudo);
    if (!Array.isArray(v)) return [];
    const vistos = new Set<string>();
    for (const x of v) if (typeof x === 'string' && UUID.test(x)) vistos.add(x.toLowerCase());
    return [...vistos];
  } catch {
    return [];
  }
}

/** Pone o quita. Lista NUEVA: mutar el estado de React no repinta. */
export function alternarFavorito(lista: string[], id: string): string[] {
  const k = id.toLowerCase();
  return lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k];
}

export function esFavorito(lista: string[], id: string): boolean {
  return lista.includes(id.toLowerCase());
}
