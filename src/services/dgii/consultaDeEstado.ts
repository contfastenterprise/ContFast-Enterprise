/**
 * Que se hace con lo que contesta una CONSULTA de estado a mSeller (lote 260).
 *
 * Puro: sin base de datos ni red, para que el banco lo ejecute.
 *
 * UN VEREDICTO DEFINITIVO NO LO DESHACE UNA CONSULTA
 * --------------------------------------------------
 * La consulta (boton de la fila, seleccion, "Consultar DGII") escribia en la
 * factura lo que leyera, fuera cual fuera el estado de antes. Dos casos medidos
 * el 2026-10-03 en los que eso estropea un dato bueno:
 *
 *   - E340000000002 (PRODUCCION) esta DADA DE BAJA (lote 140: asiento
 *     contrario, CxC retirada). mSeller la tiene en "Error" con rechazos, asi
 *     que consultarla la devolvia a `rejected` -- y la pantalla volvia a
 *     ofrecer "Reenviar" y "Dar de baja" sobre algo ya dado de baja.
 *   - E320000001014 (PRUEBA) esta ACEPTADA. La prueba de `validate=true` del
 *     lote 222 la dejo en "Error" en mSeller, asi que consultarla la bajaba a
 *     rechazada. La DGII no revoca una aceptacion.
 *
 * Se sigue CONSULTANDO una aceptada si alguien la elige: la consulta recupera
 * la firma (codigo de seguridad, QR) de las facturas que la perdieron, y eso
 * vale. Lo que no hace es cambiarle el estado ni el mensaje.
 */

/** Estados que una consulta de estado no puede cambiar. */
export const ESTADOS_DEFINITIVOS = ['accepted', 'void'] as const;

/**
 * Lo que NO se consulta al sincronizar todo el filtro: lo definitivo (la
 * consulta no lo va a cambiar) y el borrador (no se ha enviado). Con miles de
 * aceptadas en el historial, consultarlas todas seria pedirle a mSeller
 * decenas de tandas para no cambiar nada.
 */
export const ESTADOS_QUE_NO_SE_SINCRONIZAN = [...ESTADOS_DEFINITIVOS, 'draft'] as const;

/** mSeller acepta como mucho 100 e-NCF por consulta. */
export const MAXIMO_POR_CONSULTA = 100;

/**
 * Cuantas facturas se consultan, como mucho, al sincronizar un filtro. Cinco
 * tandas. Un filtro mas ancho se recorta a las mas recientes y se dice.
 */
export const TOPE_DEL_FILTRO = 500;

export function esDefinitivo(estado: string | null | undefined): boolean {
  return (ESTADOS_DEFINITIVOS as readonly string[]).includes(estado ?? '');
}

/**
 * El estado que queda tras consultar: el leido, salvo que el de antes sea
 * definitivo. `protegido` dice que la consulta contradecia un veredicto
 * definitivo y se ignoro (ni estado ni mensaje se escriben).
 */
export function estadoTrasConsultar(
  actual: string,
  leido: string
): { estado: string; protegido: boolean } {
  if (esDefinitivo(actual) && leido !== actual) return { estado: actual, protegido: true };
  return { estado: leido, protegido: false };
}

/** Parte una lista en tandas de `n`. */
export function enTandas<T>(lista: readonly T[], n: number = MAXIMO_POR_CONSULTA): T[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error('El tamaño de la tanda tiene que ser un entero positivo.');
  const tandas: T[][] = [];
  for (let i = 0; i < lista.length; i += n) tandas.push(lista.slice(i, i + n));
  return tandas;
}

export interface ResumenDeSincronizacion {
  /** Facturas que se le preguntaron a mSeller. */
  consultadas: number;
  /** De esas, cuantas cambiaron de estado. */
  cambiaron: number;
  /** Del filtro, cuantas no se consultaron por estar ya resueltas o en borrador. */
  sinConsultar: number;
  /** Cuantas quedaron fuera por el tope. */
  recortadas: number;
  /** Si una tanda fallo despues de otras buenas, por que. */
  fallo?: string | null;
}

/** El aviso que ve quien pulso. */
export function avisoDeSincronizacion(r: ResumenDeSincronizacion): {
  tipo: 'success' | 'warning' | 'info';
  texto: string;
} {
  const partes: string[] = [];
  if (r.consultadas === 0) {
    partes.push('Ningún comprobante del filtro espera veredicto de la DGII.');
  } else {
    const c = r.consultadas === 1 ? '1 comprobante' : `${r.consultadas} comprobantes`;
    const v = r.cambiaron === 1 ? '1 cambió de estado' : `${r.cambiaron} cambiaron de estado`;
    partes.push(`Se consultaron ${c} en la DGII; ${v}.`);
  }
  if (r.sinConsultar > 0) {
    partes.push(
      r.sinConsultar === 1
        ? '1 no se consultó porque ya está resuelto (aceptado, dado de baja o borrador).'
        : `${r.sinConsultar} no se consultaron porque ya están resueltos (aceptados, dados de baja o borradores).`
    );
  }
  if (r.recortadas > 0) {
    partes.push(`Solo se consultaron los ${TOPE_DEL_FILTRO} más recientes: quedan ${r.recortadas}; acote el filtro para verlos.`);
  }
  if (r.fallo) {
    partes.push(`La consulta se cortó a medias: ${r.fallo}`);
  }
  const tipo = r.fallo || r.recortadas > 0 ? 'warning' : r.consultadas === 0 ? 'info' : 'success';
  return { tipo, texto: partes.join(' ') };
}
