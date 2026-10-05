/**
 * Las clases de la barra de arriba del panel (lote 301).
 *
 * POR QUE ESTE FICHERO
 * --------------------
 * Pedido del dueño (2026-10-05): *"cuando esta en modo prueba el header no debe
 * cambiar el color"*. Hasta el lote 300 la barra era NEGRA en PRUEBA
 * (`bg-zinc-950 text-white border-red-500/20 shadow-md`) y clara en PRODUCCION
 * (el degradado celeste). Ahora es la misma en los dos.
 *
 * Y despues, en el mismo lote: *"puedes quitar la franja ... ya que hay un
 * indicador que dice cuando esta en prueba o produccion"*. La franja rayada de
 * arriba ("MODO PRUEBA (SANDBOX) - OPERACIONES FISCALMENTE NULAS") se retiro: el
 * entorno lo dice el punto de al lado de la campana (`InsigniaEntorno`), cuyo globo
 * explica la consecuencia ("lo que emita no vale ante la DGII"). El lote 192 la
 * habia dejado como advertencia legal; el dueño decidio que el punto basta.
 *
 * Sin franja, la barra va siempre arriba del todo (`top-0`): nada depende ya del
 * entorno, ni el color ni el sitio.
 *
 * Fichero puro y sin imports, para que el banco lo ejecute (leccion del lote 190:
 * una regla escrita dentro del componente acaba probada en su copia).
 */

/** Fondo, texto, borde y sombra: los de PRODUCCION de siempre, en todo entorno. */
export const COLOR_DE_LA_BARRA =
  'bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-100 text-slate-900 border-indigo-200/50 shadow-sm';

/** Las clases de color y posicion de la barra: las mismas en PRUEBA y en PRODUCCION. */
export function clasesDeLaBarra(): string {
  return `top-0 ${COLOR_DE_LA_BARRA}`;
}
