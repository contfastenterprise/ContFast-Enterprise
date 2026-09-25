/**
 * Lo guardado en el navegador sobre el menu, validado.
 *
 * POR QUE ESTE FICHERO (lote 195)
 * -------------------------------
 * La validacion de estas dos preferencias vivia dentro del sidebar, mezclada con
 * el acceso a `localStorage`. Eso tenia dos consecuencias:
 *
 *   · un banco no podia EJECUTARLA (dentro de un fichero con `'use client'`, React
 *     e iconos no se puede cargar), asi que "solo booleanos" y "solo cadenas" se
 *     comprobaban leyendo el texto del fichero -- o sea, mirando que la linea
 *     estuviera escrita, no que funcionara;
 *   · y estaba pegada al defecto que este lote arregla (leer el navegador mientras
 *     se pinta), asi que al mover una cosa se movia la otra.
 *
 * Aqui solo se INTERPRETA un texto. Quien lo saca de `localStorage` es
 * `hooks/usePreferenciaDelNavegador`. Sin imports, sin `window`: se puede ejecutar.
 *
 * LAS DOS DEVUELVEN `null` CUANDO NO HAY NADA UTILIZABLE, y esa distincion importa:
 * `null` significa "no hay preferencia guardada" y deja el valor de partida en pie;
 * un objeto o una lista vacios significan "esta persona lo dejo todo cerrado / sin
 * anclas", que es una preferencia legitima y hay que respetarla.
 */

/** Los grupos abiertos: titulo -> abierto. */
export type GruposGuardados = Record<string, boolean>;

/**
 * Los grupos abiertos que hubiera guardados, o `null`.
 *
 * Solo booleanos, clave a clave. Si alguien dejo basura en esa clave -- otra
 * version de la aplicacion, una extension, un experimento --, lo que no encaja se
 * descarta en vez de colarse en el estado de React, donde acabaria decidiendo si un
 * grupo se pinta abierto.
 */
export function gruposDesdeTexto(crudo: string | null | undefined): GruposGuardados | null {
  if (!crudo) return null;
  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    //  Texto que no es JSON: no hay preferencia, no hay error.
    return null;
  }
  if (!leido || typeof leido !== 'object' || Array.isArray(leido)) return null;
  const limpio: GruposGuardados = {};
  for (const [k, v] of Object.entries(leido as Record<string, unknown>)) {
    if (typeof v === 'boolean') limpio[k] = v;
  }
  return limpio;
}

/**
 * Las rutas ancladas que hubiera guardadas, o `null`.
 *
 * Solo cadenas no vacias: un `null` o un numero colado en la lista acabaria en
 * `<Link href={...}>`, y un `href` que no es una ruta es un enlace roto en el sitio
 * mas visible del menu.
 */
export function favoritosDesdeTexto(crudo: string | null | undefined): string[] | null {
  if (!crudo) return null;
  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!Array.isArray(leido)) return null;
  return leido.filter((v): v is string => typeof v === 'string' && v.length > 0);
}
