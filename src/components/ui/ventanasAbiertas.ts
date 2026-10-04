/**
 * Lote 276: lo que el `Modal` compartido decide sin tocar el navegador, para poder ejecutarlo en un banco.
 *
 * - **Una pila de ventanas abiertas.** Con una ventana encima de otra (ver un pago y, dentro, confirmar
 *   algo), Escape tiene que cerrar SOLO la de arriba. Antes cada ventana escuchaba Escape por su cuenta
 *   y cerraban todas a la vez.
 * - **El bloqueo del desplazamiento de la pagina, con contador.** Si cada ventana lo quita al cerrarse,
 *   cerrar la de arriba devuelve el desplazamiento con la de abajo todavia abierta.
 * - **Adonde va el foco con Tab**: dentro de la ventana, dando la vuelta en los extremos (sin esto, Tab
 *   saca el foco a la pagina de detras, que no se ve).
 */

const pila: string[] = [];

/** Abre una ventana: queda arriba del todo. Devuelve si es la primera (hay que bloquear el desplazamiento). */
export function abrirVentana(id: string): boolean {
  const i = pila.indexOf(id);
  if (i !== -1) pila.splice(i, 1);
  pila.push(id);
  return pila.length === 1;
}

/** Cierra una ventana (este donde este). Devuelve si ya no queda ninguna (hay que devolver el desplazamiento). */
export function cerrarVentana(id: string): boolean {
  const i = pila.indexOf(id);
  if (i !== -1) pila.splice(i, 1);
  return pila.length === 0;
}

/** Si esta ventana es la de arriba: solo ella atiende Escape. */
export function esLaDeArriba(id: string): boolean {
  return pila.length > 0 && pila[pila.length - 1] === id;
}

/** Para los bancos: vacia la pila. */
export function vaciarVentanas(): void {
  pila.length = 0;
}

/**
 * El indice del elemento que recibe el foco al pulsar Tab (o Mayus+Tab) dentro de una ventana con
 * `total` elementos enfocables, estando el foco en `actual` (-1 si esta fuera de ellos). Da la vuelta
 * en los extremos; con ninguno enfocable devuelve -1 (el foco se queda en la ventana).
 */
export function siguienteFoco(total: number, actual: number, haciaAtras: boolean): number {
  if (total <= 0) return -1;
  if (actual < 0 || actual >= total) return haciaAtras ? total - 1 : 0;
  if (haciaAtras) return actual === 0 ? total - 1 : actual - 1;
  return actual === total - 1 ? 0 : actual + 1;
}
