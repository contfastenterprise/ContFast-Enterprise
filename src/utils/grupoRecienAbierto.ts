/**
 * Que grupo del menu se acaba de ABRIR, si se ha abierto alguno.
 *
 * POR QUE (lote 194)
 * ------------------
 * Pedido del dueño: al pulsar un grupo del menu para desplegarlo, ese grupo tiene
 * que subir a la parte de arriba, para que el despliegue se vea completo.
 *
 * El problema es real y es consecuencia de lo que hay: 50 elementos en 9 grupos, o
 * sea hasta 59 filas. Si pulsas un grupo que esta en la mitad de abajo -- Sistema,
 * Finanzas, RRHH --, su submenu se abre DEBAJO DEL PLIEGUE: has pulsado para ver
 * algo y lo que se despliega no se ve. Hay que volver a hacer scroll, que es
 * exactamente lo que el lote 189 vino a quitar.
 *
 * Y lo que hay hoy no lo resuelve: el 189 trae a la vista el elemento ACTIVO
 * (`block: 'nearest'`), que es otra cosa -- el activo puede estar en un grupo
 * distinto del que acabas de abrir, y `nearest` mueve lo menos posible, justo lo
 * contrario de "llevalo arriba".
 *
 * QUE DECIDE ESTE FICHERO, Y POR QUE ES UNA REGLA Y NO UN DETALLE:
 *
 *   · Al ABRIR se sube el grupo. Al CERRAR, no: cerrar reduce la lista, no esconde
 *     nada debajo del pliegue, y mover el menu cuando el usuario solo queria
 *     plegar algo es movimiento gratis -- el menu se va de debajo del raton.
 *   · Solo cuenta lo que abre UNA PERSONA al pulsar. El grupo de la pagina actual
 *     se abre solo en cada navegacion (`abrirGrupo`), y si eso subiera el menu, al
 *     entrar a cualquier pantalla el menu daria un salto sin que nadie lo tocara.
 *     Por eso esta regla se aplica SOLO en el clic.
 *
 * Fichero puro y sin imports, para poder ejecutarlo en un banco: dentro del
 * componente (`'use client'`, React, iconos) no se puede cargar, y un banco que
 * reimplementa la regla comprueba su propia copia (leccion del lote 190).
 */

/** Los grupos abiertos, tal como se guardan: titulo -> abierto. */
export type GruposAbiertos = Record<string, boolean>;

/**
 * El titulo del grupo que pasa de cerrado a abierto entre `antes` y `despues`, o
 * `null` si ninguno se abrio.
 *
 * Devuelve UNO y no una lista porque solo se puede subir un grupo a la vez: si
 * alguna vez dos se abrieran en el mismo paso, subir el segundo dejaria al primero
 * otra vez fuera de la vista. Se queda el primero por orden de recorrido, que es el
 * orden de insercion del objeto -- o sea el orden en que se fueron abriendo.
 *
 * Un grupo que YA estaba abierto no cuenta: pulsar sobre uno abierto lo cierra, y
 * volver a pulsarlo lo abre -- eso ultimo si cuenta, porque venia de cerrado.
 */
export function grupoRecienAbierto(
  antes: GruposAbiertos,
  despues: GruposAbiertos,
): string | null {
  for (const titulo of Object.keys(despues)) {
    //  `!antes[titulo]` cubre los tres casos de "no estaba abierto": false,
    //  undefined (nunca se toco) y ausente del objeto guardado.
    if (despues[titulo] && !antes[titulo]) return titulo;
  }
  return null;
}
