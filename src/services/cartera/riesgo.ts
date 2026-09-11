/**
 * El nivel de riesgo de una cuenta: se DERIVA, no se guarda.
 *
 * POR QUE DERIVADO
 * ----------------
 * El proyecto del que sale esta pantalla traia el riesgo como un campo escrito
 * a mano en sus datos de ejemplo. Guardarlo aqui seria un numero que envejece
 * solo: la factura sigue venciendo un dia tras otro y el campo se queda quieto,
 * asi que a la semana la pantalla estaria clasificando por una realidad que ya
 * no existe. Es la misma familia de errores que la auditoria lleva cerrando
 * desde P0 -- un dato que se calculo una vez y se presento para siempre.
 *
 * Derivado de los dias de atraso, no puede quedarse atras: se recalcula cada
 * vez que se mira.
 *
 * LOS UMBRALES, Y DESDE CUANDO CUENTAN
 * -------------------------------------
 * NO cuentan desde que se emite el documento: cuentan desde que vence su plazo
 * de credito, que en este sistema es de 30 dias. Un documento dentro de sus 30
 * dias NO esta atrasado, y por eso su titular es de riesgo bajo aunque deba
 * dinero. Esto se dice tambien en pantalla, porque un cliente que debe mucho y
 * aparece en verde no se entiende sin saberlo.
 *
 * Los tramos son los del proyecto original: al dia, 1 a 15 dias de atraso, 16 a
 * 45, y mas de 45. Estan aqui una sola vez para que la tabla, la dona y la
 * leyenda no puedan discrepar entre ellas.
 */
export type NivelRiesgo = 'bajo' | 'medio' | 'alto' | 'critico';

export const NIVELES: NivelRiesgo[] = ['bajo', 'medio', 'alto', 'critico'];

export interface ConfigNivel {
  key: NivelRiesgo;
  etiqueta: string;
  etiquetaCorta: string;
  criterio: string;
  color: string;
  clasesInsignia: string;
  descripcion: string;
}

export const CONFIG_RIESGO: Record<NivelRiesgo, ConfigNivel> = {
  bajo: {
    key: 'bajo',
    etiqueta: 'Bajo Riesgo (Normal)',
    etiquetaCorta: 'Bajo Riesgo',
    criterio: 'Al día / Solvente',
    color: '#10b981',
    clasesInsignia: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    descripcion: 'Sin documentos vencidos: todo dentro de su plazo de crédito.',
  },
  medio: {
    key: 'medio',
    etiqueta: 'Riesgo Medio (Moderado)',
    etiquetaCorta: 'Riesgo Medio',
    criterio: 'Atraso ≤ 15 días',
    color: '#f59e0b',
    clasesInsignia: 'bg-amber-50 text-amber-700 border-amber-200',
    descripcion: 'Atrasos de 1 a 15 días tras vencer el crédito.',
  },
  alto: {
    key: 'alto',
    etiqueta: 'Alto Riesgo (Alerta)',
    etiquetaCorta: 'Alto Riesgo',
    criterio: 'Atraso de 16 a 45 días',
    color: '#f97316',
    clasesInsignia: 'bg-orange-50 text-orange-700 border-orange-200',
    descripcion: 'Atraso recurrente de 16 a 45 días tras vencer el crédito.',
  },
  critico: {
    key: 'critico',
    etiqueta: 'Riesgo Crítico (Vencido)',
    etiquetaCorta: 'Crítico',
    criterio: 'Atraso de más de 45 días',
    color: '#ef4444',
    clasesInsignia: 'bg-rose-50 text-rose-700 border-rose-200',
    descripcion: 'Atraso de más de 45 días, cartera vencida.',
  },
};

/**
 * Los dias de atraso que deciden el nivel son los de la cuota MAS atrasada que
 * sigue con saldo, no un promedio: una sola factura de 60 dias es un problema
 * aunque las otras nueve esten al dia, y promediarla la esconderia.
 *
 * Se cuentan DESDE EL VENCIMIENTO, no desde la emision: los 30 dias de credito
 * ya estan descontados. Cero o negativo -- nada vencido, o aun dentro del
 * plazo -- es riesgo bajo.
 */
export function nivelPorAtraso(diasAtraso: number): NivelRiesgo {
  // UN DATO ILEGIBLE NO SE PRESENTA COMO "AL DIA".
  //
  // Desde el repositorio esto no puede pasar -- `Number(...) || 0` ya coacciona
  // antes de llegar aqui --, asi que si aparece un NaN es que algo se rompio
  // antes. Y un dato roto se enseña como algo que hay que mirar, no como un
  // cliente solvente: entre dos respuestas imposibles, la que hace ruido gana a
  // la que tranquiliza. Presentar lo desconocido como buenas noticias es
  // exactamente el error que esta auditoria lleva cerrando desde el primer dia.
  if (Number.isNaN(diasAtraso)) return 'critico';

  // `-Infinity` cae aqui: aun no vence, luego no hay atraso.
  if (diasAtraso <= 0) return 'bajo';
  if (diasAtraso <= 15) return 'medio';
  if (diasAtraso <= 45) return 'alto';

  // `Infinity` cae aqui, que es lo que significa: atraso sin fondo.
  return 'critico';
}
