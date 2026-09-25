/**
 * Los elementos del menu que alguien ancla arriba.
 *
 * POR QUE (lote 191)
 * ------------------
 * Medido el 2026-09-24: el menu tiene 50 elementos en 9 grupos. El lote 189 hizo
 * que el scroll se vea y que lo que abres se recuerde, pero **el menu sigue
 * siendo grande**. Lo que de verdad convierte 50 en 5 es que cada uno se quede
 * con los suyos.
 *
 * Y se sabe cuales son los suyos: en PRODUCCION, `expenses` 113, `invoices` 88,
 * `products` 87, `inventory_movements` 476, `delivery_notes` 70. Frente a
 * `employees` 1 o `credit_debit_notes` 0. El dia a dia son cinco o seis
 * pantallas de las cincuenta.
 *
 * ANCLAR Y NO "RECIENTES": decision del dueño (2026-09-24). Los recientes no se
 * configuran, pero cambian solos -- el menu se mueve debajo del raton y lo que
 * ayer estaba arriba hoy no esta. Anclar cuesta un clic una vez y despues no se
 * mueve nunca.
 *
 * ESTE FICHERO ES PURO: sin React, sin `localStorage`, sin imports. La lectura y
 * la escritura viven en el sidebar, junto a la de los grupos abiertos; aqui solo
 * esta la regla, para que se pueda ejecutar en un banco. Es la leccion del lote
 * 190: una regla dentro de un componente con `'use client'` no se puede probar
 * sin reimplementarla, y reimplementarla no prueba nada.
 */

/**
 * Ancla o desancla, y devuelve la lista nueva.
 *
 * El orden es el de ANCLADO, no alfabetico: quien ancla Facturacion primero la
 * quiere primera. Reordenar por nombre le quitaria el control de lo unico que
 * tiene sentido que controle.
 *
 * Devuelve una lista NUEVA -- nunca modifica la que recibe -- porque quien la usa
 * es estado de React: mutarla no repinta.
 */
export function alternarFavorito(favoritos: readonly string[], href: string): string[] {
  if (!href) return [...favoritos];
  return favoritos.includes(href)
    ? favoritos.filter((f) => f !== href)
    : [...favoritos, href];
}

/** ¿Esta anclado? */
export function esFavorito(favoritos: readonly string[], href: string): boolean {
  return favoritos.includes(href);
}

/**
 * Los anclados que SE PUEDEN ENSEÑAR, en el orden en que se anclaron.
 *
 * Se cruzan con los elementos que el menu ya calculo, y eso importa por dos
 * motivos que no son teoricos:
 *
 *  1. PERMISOS. `items` viene de `buildSidebar`, o sea ya filtrado por lo que
 *     esta persona puede ver. Si a alguien le retiran el permiso de una pantalla
 *     que tenia anclada, el ancla no puede seguir enseñandosela: seria un enlace
 *     a un 403 en el sitio mas visible del menu.
 *
 *  2. RUTAS QUE YA NO EXISTEN. Un ancla guardada en el navegador sobrevive a que
 *     la pantalla se retire (paso de verdad: el lote 100 retiro el modulo de
 *     documentos entero). Se ignora en silencio en vez de pintar un enlace roto.
 *
 * No se borra el ancla de lo que no se puede enseñar: si el permiso vuelve, el
 * ancla sigue ahi. Limpiar por lo que hoy no se ve seria perder la preferencia
 * por un cambio temporal.
 */
export function favoritosVisibles<T extends { href: string }>(
  items: readonly T[],
  favoritos: readonly string[],
): T[] {
  const porRuta = new Map<string, T>();
  for (const item of items) {
    //  El primero gana, como en `unaEntradaPorRuta`: la misma pantalla puede
    //  venir dos veces si tiene dos modulos de permisos.
    if (!porRuta.has(item.href)) porRuta.set(item.href, item);
  }
  const salida: T[] = [];
  for (const href of favoritos) {
    const item = porRuta.get(href);
    if (item) salida.push(item);
  }
  return salida;
}

/**
 * Lo que enseña el buscador CUANDO NO SE HA ESCRITO NADA.
 *
 * Hoy (lote 189) enseña `allItems.slice(0, 7)`: los siete primeros del menu, que
 * para quien abre Ctrl+K es un orden arbitrario -- salen los del grupo que
 * `buildSidebar` puso primero, no los que usa. Abrir el buscador y tener que
 * escribir siempre es no aprovechar la lista.
 *
 * Con anclas hay algo mejor que ofrecer: **lo anclado primero**, y despues se
 * rellena con el principio del menu hasta el tope, para que la lista no quede
 * casi vacia cuando solo hay una o dos anclas.
 *
 * El tope se respeta incluso con mas anclas que huecos: lo anclado manda, pero la
 * lista no crece sin fin (el modal tiene una altura fija y el resto quedaria
 * detras de un scroll que nadie mira).
 */
export function sugerenciasIniciales<T extends { href: string }>(
  items: readonly T[],
  favoritos: readonly string[],
  tope: number,
): T[] {
  if (tope <= 0) return [];
  const anclados = favoritosVisibles(items, favoritos).slice(0, tope);
  const yaEsta = new Set(anclados.map((i) => i.href));
  const salida = [...anclados];
  for (const item of items) {
    if (salida.length >= tope) break;
    if (yaEsta.has(item.href)) continue;
    yaEsta.add(item.href);
    salida.push(item);
  }
  return salida;
}
