/**
 * Que filas de `route_mappings` deciden quien entra en una ruta.
 *
 * POR QUE ESTE FICHERO (lote 289)
 * -------------------------------
 * `route_mappings` puede tener VARIAS filas para la misma pantalla, una por cada modulo
 * de permisos que da acceso a ella (lote 190). Medido en PRODUCCION:
 *
 *     /dashboard/antiguedad-saldos%   module = cobros
 *     /dashboard/antiguedad-saldos%   module = proveedores
 *
 * Estan para que la vea quien lleva los cobros Y quien lleva los suplidores. El menu ya lo
 * respetaba (`buildSidebar` mira cada fila y el sidebar quita la repetida), pero
 * `canAccessRoute` se quedaba con la PRIMERA fila que casaba y decidia solo con ella: a
 * quien tenia el otro permiso el menu le ofrecia la pantalla y la guarda de rutas lo
 * mandaba a /403. Cual de las dos era "la primera" dependia del orden en que la base
 * devolviera las filas, un detalle que nadie controla.
 *
 * Ahora la ruta la decide el patron MAS ESPECIFICO que casa (como antes: el mas largo), y
 * de ese patron cuentan TODAS sus filas: basta con tener el permiso de una.
 *
 * Sin imports a proposito, como `menuSinRepetidos`: asi un banco la carga y la ejecuta en
 * vez de reimplementarla.
 */

export interface FilaDePermiso {
  routePattern: string;
  module: string;
  action: string | null;
}

/** Patron SQL LIKE (`%` = cualquier cosa) a expresion regular, sin distinguir mayusculas. */
function patronARegex(patron: string): RegExp {
  const cuerpo = patron
    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/%/g, '.*');
  return new RegExp('^' + cuerpo + '$', 'i');
}

/**
 * Las filas que deciden `path`: todas las del patron mas largo que casa con el.
 * `null` si ningun patron casa (quien llama decide que hacer; hoy, dejar pasar).
 *
 * No ordena la entrada: busca el patron mas largo por su cuenta, asi el resultado no
 * depende del orden en que lleguen las filas.
 */
export function filasDeLaRuta<T extends FilaDePermiso>(path: string, filas: readonly T[]): T[] | null {
  let ganador: string | null = null;
  for (const f of filas) {
    if (!f.routePattern) continue;
    if (ganador !== null && f.routePattern.length <= ganador.length) continue;
    if (patronARegex(f.routePattern).test(path)) ganador = f.routePattern;
  }
  if (ganador === null) return null;
  return filas.filter((f) => f.routePattern === ganador);
}

/** Si alguna de las filas que deciden `path` concede el acceso. Sin filas: `null`. */
export function algunaFilaConcede(
  path: string,
  filas: readonly FilaDePermiso[],
  tienePermiso: (modulo: string, accion: string) => boolean,
): boolean | null {
  const deciden = filasDeLaRuta(path, filas);
  if (deciden === null) return null;
  return deciden.some((f) => tienePermiso(f.module, f.action || 'read'));
}
