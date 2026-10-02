/**
 * Seguir el veredicto de la DGII desde la PANTALLA, tras emitir (lote 246).
 *
 * Reportado por el dueño (2026-10-02): "cuando emito una factura y vuelve al
 * historial, el estado de dicha factura no se actualiza; tengo que actualizar
 * la pagina para ver el estado correcto, ya que se queda en ENVIADO".
 *
 * POR QUE PASABA. La pantalla preguntaba UNA sola vez, a los 5 segundos. Y lo
 * medido dice que a los 5 s solo ha resuelto el 15 % (lote 180: mediana 20 s);
 * las e-32 tardan 6-9 s y las e-31 entre 73 y 119 s (lote 219). El servidor si
 * persigue el veredicto y lo guarda, pero nadie le decia a la pantalla que ya
 * estaba: la lista se quedaba con lo que leyo al emitir.
 *
 * AHORA la pantalla insiste, con huecos que se alargan, hasta que hay
 * veredicto o se acaba la escalera (3 min 15 s; pasado eso, el veredicto ya no
 * es cosa de segundos y lo recoge el barrido). Pregunta a la misma ruta que el
 * boton de sincronizar, asi que cada consulta ademas EMPUJA: si mSeller ya
 * tiene el veredicto, queda guardado.
 *
 * Puro -- recibe como preguntar y como esperar -- para que el banco lo ejecute
 * sin red y sin reloj.
 */

/** Acumulado: 5 s, 15 s, 35 s, 75 s, 135 s, 195 s. */
export const ESPERAS_TRAS_EMITIR_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000];

export type RespuestaDeEstado = { status?: string; message?: string } | null;

export type FinDelSeguimiento =
  | { veredicto: 'accepted' | 'rejected'; mensaje?: string; consultas: number }
  /** Sin veredicto: se acabo la escalera, o quien miraba se fue de la pantalla. */
  | { veredicto: null; consultas: number };

const esVeredicto = (s: unknown): s is 'accepted' | 'rejected' => s === 'accepted' || s === 'rejected';

export async function seguirVeredicto(o: {
  /** Pregunta el estado. Puede fallar o no saber: se sigue con el siguiente hueco. */
  consultar: () => Promise<RespuestaDeEstado>;
  /** `false` cuando ya no hay a quien avisar (se salio de la pantalla): no se consulta mas. */
  sigue?: () => boolean;
  esperas?: readonly number[];
  dormir?: (ms: number) => Promise<void>;
}): Promise<FinDelSeguimiento> {
  const esperas = o.esperas ?? ESPERAS_TRAS_EMITIR_MS;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sigue = o.sigue ?? (() => true);
  let consultas = 0;
  for (const espera of esperas) {
    await dormir(espera);
    if (!sigue()) return { veredicto: null, consultas };
    let r: RespuestaDeEstado = null;
    //  Una consulta que falla (la red, un 5xx) no corta el seguimiento: la siguiente puede salir bien.
    try { r = await o.consultar(); } catch { r = null; }
    consultas++;
    if (r && esVeredicto(r.status)) return { veredicto: r.status, mensaje: r.message, consultas };
  }
  return { veredicto: null, consultas };
}
