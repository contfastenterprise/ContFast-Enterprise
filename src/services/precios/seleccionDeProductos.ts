/**
 * Lote 251: marcar varios productos para atarlos al dolar con el mismo costo.
 * Puro, para que el banco lo ejecute (la pantalla solo lo pinta).
 *
 * Lo marcado es una lista y no un conjunto a proposito: se enseña en el orden en
 * que se marco, y sobrevive a cambiar la busqueda (se puede marcar de varias).
 */
export type Marcable = { id: string };

/** Marca el producto si no lo estaba, y lo desmarca si lo estaba. */
export function alternar<T extends Marcable>(marcados: T[], p: T): T[] {
  return marcados.some((x) => x.id === p.id) ? marcados.filter((x) => x.id !== p.id) : [...marcados, p];
}

/** Los encontrados que aun no estan marcados (lo que "Marcar los N" anadiria). */
export function sinMarcar<T extends Marcable>(marcados: T[], encontrados: T[]): T[] {
  const ya = new Set(marcados.map((x) => x.id));
  return encontrados.filter((p) => !ya.has(p.id));
}

/** Marca todos los encontrados, sin repetir los que ya estaban. */
export function marcarTodos<T extends Marcable>(marcados: T[], encontrados: T[]): T[] {
  return [...marcados, ...sinMarcar(marcados, encontrados)];
}
