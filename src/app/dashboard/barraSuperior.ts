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
 * EL ENTORNO YA SE DICE EN DOS SITIOS, y por eso el color sobraba: la franja
 * rayada de arriba ("MODO PRUEBA (SANDBOX) - OPERACIONES FISCALMENTE NULAS"),
 * que es una advertencia legal y SE QUEDA (lote 192), y el punto del entorno al
 * lado de la campana (`InsigniaEntorno`). Un tercer aviso -- la barra entera en
 * negro -- ademas obligaba a que todo lo de dentro (el selector de empresa, la
 * campana, el avatar, los botones del menu) se leyera sobre dos fondos.
 *
 * LO UNICO QUE SIGUE DEPENDIENDO DE LA FRANJA ES LA POSICION: con la franja
 * puesta (h-11) la barra baja a `top-11`, o la taparia. No es color, es sitio.
 *
 * Fichero puro y sin imports, para que el banco lo ejecute (leccion del lote 190:
 * una regla escrita dentro del componente acaba probada en su copia).
 */

/** Fondo, texto, borde y sombra: los de PRODUCCION de siempre, en todo entorno. */
export const COLOR_DE_LA_BARRA =
  'bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-100 text-slate-900 border-indigo-200/50 shadow-sm';

/**
 * Las clases de color y posicion de la barra.
 *
 * Recibe si hay franja y no el entorno, a proposito: el color ya no depende de
 * nada, y lo que la barra necesita saber es solo si tiene algo encima.
 */
export function clasesDeLaBarra(conFranja: boolean): string {
  return `${conFranja ? 'top-11' : 'top-0'} ${COLOR_DE_LA_BARRA}`;
}
