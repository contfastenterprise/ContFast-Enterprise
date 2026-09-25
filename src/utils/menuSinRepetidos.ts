/**
 * Una entrada por pantalla, aunque el permiso venga de dos sitios.
 *
 * POR QUE ESTE FICHERO (lote 190)
 * -------------------------------
 * `route_mappings` puede tener VARIAS filas para la misma pantalla, una por cada
 * modulo de permisos que da acceso a ella. Medido en PRODUCCION el 2026-09-24:
 *
 *     /dashboard/antiguedad-saldos%   module = cobros
 *     /dashboard/antiguedad-saldos%   module = proveedores
 *
 * Misma ruta, mismo nombre, mismo grupo. Estan a proposito: esa pantalla la tiene
 * que ver tanto quien lleva los cobros como quien lleva los suplidores. **Borrar
 * una le quitaria la entrada del menu a un rol entero**, y sin aviso -- el menu se
 * pinta con lo que hay, no se queja de lo que falta. `route_mappings` no tiene
 * `company_id`, asi que ademas afectaria a las seis empresas a la vez.
 *
 * El sidebar ya lo tenia en cuenta con un `Set` local; el buscador de Ctrl+K no, y
 * por eso salia dos veces. La regla vive AQUI y no dentro del componente para que
 * se pueda ejecutar en un banco: dentro de un fichero con `'use client'`, React y
 * iconos no se puede cargar sin levantar media aplicacion, y un banco que
 * reimplementa la regla para probarla no prueba nada -- comprueba su propia copia.
 *
 * Sin imports a proposito: asi no hay forma de que deje de poder cargarse.
 */

/**
 * Deja una sola entrada por `href`, conservando la PRIMERA.
 *
 * La primera y no la ultima porque el orden que llega ya viene decidido por
 * `buildSidebar` (por grupo y `order_index`): quedarse con la ultima cambiaria el
 * icono o el nombre segun que fila se inserto despues en la base, que es un
 * detalle que nadie controla.
 *
 * No ordena ni filtra nada mas. Lo que entra en un orden, sale en el mismo.
 */
export function unaEntradaPorRuta<T extends { href: string }>(items: readonly T[]): T[] {
  const vistas = new Set<string>();
  const salida: T[] = [];
  for (const item of items) {
    if (vistas.has(item.href)) continue;
    vistas.add(item.href);
    salida.push(item);
  }
  return salida;
}
