/**
 * Leer una respuesta de nuestra API mirando el ESTADO antes que el cuerpo.
 *
 * Nacio dentro del visor del conduce (lote 225) y sube aqui en el lote 227,
 * al cerrar las advertencias de React Doctor de la pantalla de conduces: nueve
 * llamadas hacian `await res.json()` y DESPUES miraban `data.success`, sin
 * mirar `res.ok`. Dos cosas que eso escondia:
 *
 *   · un 4xx o 5xx con cuerpo JSON se leia como si fuera una respuesta mas, y
 *     todo dependia de que el servidor hubiera puesto `success: false`;
 *   · un 5xx con cuerpo que NO es JSON (la pagina de error de la plataforma)
 *     hacia fallar `res.json()`, y el `catch` lo contaba como "error de red",
 *     que es mentira: la red funciono, fallo el servidor.
 *
 * Aqui el estado manda: fuera de 2xx es un fallo, y del cuerpo solo se saca el
 * mensaje si lo hay. Un 2xx sin `success` tampoco se da por bueno. Nunca lanza.
 *
 * Sin React y sin red propia: recibe la `Response` ya pedida.
 */
export type Leido<T> =
  | { bien: true; cuerpo: T & { success: true } }
  | { bien: false; mensaje?: string; estado: number };

export async function leerRespuesta<T = Record<string, unknown>>(res: Response): Promise<Leido<T>> {
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    return { bien: false, mensaje: error?.error?.message, estado: res.status };
  }
  const cuerpo = await res.json().catch(() => null);
  return cuerpo?.success
    ? { bien: true, cuerpo }
    : { bien: false, mensaje: cuerpo?.error?.message, estado: res.status };
}
