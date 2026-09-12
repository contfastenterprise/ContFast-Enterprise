/**
 * Todo lo que hay que saber de una fecha de vencimiento, en una sola llamada.
 *
 * POR QUE EXISTE
 * --------------
 * La misma cuenta estaba hecha SEIS veces, y no daba lo mismo:
 *
 *   actions/receivables.ts            4 tramos   0-30 / 31-60 / 61-90 / 90+
 *   actions/payables.ts               4 tramos   los mismos
 *   reports/balances/customers        3 tramos   1-30 / 31-60 / 61+
 *   reports/balances/suppliers        3 tramos   idem
 *   financialRepository.ts (x2)       5 tramos   anade "no vencida"
 *
 * Tres esquemas distintos. Un cliente con 75 dias de atraso salia en "61-90" en
 * una pantalla y en "61+" en otra, y el mismo saldo caia en tramos distintos
 * segun que informe abrieras. Los dos de `financialRepository` ademas usaban
 * `Math.ceil` sobre una resta de milisegundos, mientras los otros cuatro usaban
 * `Math.round`: con la diferencia fraccionada -- que es justo lo que provocaba
 * el fallo de husos horarios -- daban numeros distintos.
 *
 * QUE DECIDE ESTE FICHERO, Y NADIE MAS
 * ------------------------------------
 *   - Cuando algo esta vencido: a partir del dia SIGUIENTE al vencimiento. El
 *     dia en que vence todavia se puede pagar.
 *   - Los cortes de los tramos: 1-30, 31-60, 61-90 y mas de 90 dias de atraso.
 *   - Que una cuenta saldada no esta vencida, tenga la fecha que tenga.
 *
 * Los informes que quieran MENOS tramos suman los que les sobren -- el de tres
 * hace `61-90` mas `90+` --, pero no redefinen las fronteras. Un solo sitio
 * donde cambiarlas si algun dia cambian.
 *
 * NINGUN `Date` PARA COMPARAR DIAS
 * --------------------------------
 * Se apoya en `utils/fechasLocales.ts`, que trabaja sobre el texto
 * 'AAAA-MM-DD'. Construir un `Date` a partir de una fecha sin hora la corre un
 * dia hacia atras en cualquier huso al oeste de Greenwich, y eso ya costo un
 * lote entero (ver `docs/auditoria/fechas_barrido_src.md`).
 */
import {
  diaDe, diasEntreDias, hoyDia, formatDateDisplay, formatDateShort,
} from '@/utils/fechasLocales';

/**
 * El centavo por debajo del cual una cuenta se da por saldada.
 * Es el mismo de todo el sistema: lo usan el estado de cuenta, la cartera y
 * el `HAVING` de `carteraRepository`.
 */
export const TOLERANCIA = 0.01;

export type Tramo = 'saldado' | 'por-vencer' | '1-30' | '31-60' | '61-90' | '90+';

/** Los tramos que SI son atraso. Sirve para sumar "lo vencido" sin listarlos a mano. */
export const TRAMOS_VENCIDOS: readonly Tramo[] = ['1-30', '31-60', '61-90', '90+'];

/** Los cortes, en dias de atraso. En un solo sitio a proposito. */
const CORTES: readonly [number, Tramo][] = [
  [30, '1-30'],
  [60, '31-60'],
  [90, '61-90'],
];

export interface Vencimiento {
  /** 'AAAA-MM-DD', o null si el documento no trae fecha. */
  dia: string | null;
  /** '30/09/2026'. '-' si no hay fecha. */
  texto: string;
  /** '30 sep', para sitios estrechos. '-' si no hay fecha. */
  corto: string;
  /** Dias de atraso. Cero el mismo dia del vencimiento y antes. */
  atraso: number;
  /** Dias que faltan para vencer. Cero si ya vencio o vence hoy. */
  faltan: number;
  vencida: boolean;
  venceHoy: boolean;
  /** Solo `true` si se paso el saldo y esta por debajo de la tolerancia. */
  saldada: boolean;
  tramo: Tramo;
}

export interface OpcionesVencimiento {
  /** El dia contra el que se mide, 'AAAA-MM-DD'. Por defecto, hoy. */
  hoy?: string;
  /**
   * El saldo pendiente. Si se pasa y esta saldado, el tramo es 'saldado' y el
   * atraso es cero: una cuenta pagada no esta vencida aunque su fecha pasara.
   * Si no se pasa, no se opina sobre el saldo.
   */
  saldo?: number;
}

export function analizarVencimiento(
  fecha: string | Date | null | undefined,
  opciones: OpcionesVencimiento = {}
): Vencimiento {
  const hoy = opciones.hoy ?? hoyDia();
  const dia = diaDe(fecha);
  const saldada = opciones.saldo !== undefined && opciones.saldo <= TOLERANCIA;

  // Sin fecha no se inventa una: cero atraso, cero dias, y el tramo dice lo que
  // se sabe. Poner hoy, o el epoch, seria afirmar algo que el documento no dice.
  const diferencia = dia ? diasEntreDias(dia, hoy) : 0;
  const atraso = saldada ? 0 : Math.max(0, diferencia);
  const faltan = saldada ? 0 : Math.max(0, -diferencia);

  return {
    dia,
    texto: formatDateDisplay(dia),
    corto: formatDateShort(dia),
    atraso,
    faltan,
    vencida: atraso > 0,
    venceHoy: !saldada && !!dia && diferencia === 0,
    saldada,
    tramo: saldada ? 'saldado' : tramoDeAtraso(atraso),
  };
}

/** El tramo que le toca a N dias de atraso. Cero o menos: todavia no vence. */
export function tramoDeAtraso(atraso: number): Tramo {
  if (atraso <= 0) return 'por-vencer';
  for (const [tope, tramo] of CORTES) {
    if (atraso <= tope) return tramo;
  }
  return '90+';
}

export type SumaPorTramo = Record<Tramo, number>;

export const tramosEnCero = (): SumaPorTramo => ({
  'saldado': 0, 'por-vencer': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
});

/** Lo vencido, que es la suma de los cuatro tramos de atraso. */
export const sumaVencida = (s: SumaPorTramo): number =>
  TRAMOS_VENCIDOS.reduce((a, t) => a + s[t], 0);

/**
 * Reparte una lista en los tramos. Es lo que hacian a mano los seis sitios.
 *
 * `saldo` y `vencimiento` se sacan de cada elemento con las funciones que se
 * pasan, para que sirva tanto a una fila de cobrar (importes como cadena) como
 * a una de pagar (numeros) sin que este fichero sepa de ninguna de las dos.
 */
export function repartirEnTramos<T>(
  elementos: readonly T[],
  saldoDe: (x: T) => number,
  vencimientoDe: (x: T) => string | Date | null | undefined,
  hoy: string = hoyDia()
): SumaPorTramo {
  const suma = tramosEnCero();
  for (const e of elementos) {
    const saldo = saldoDe(e);
    const v = analizarVencimiento(vencimientoDe(e), { hoy, saldo });
    suma[v.tramo] += saldo;
  }
  return suma;
}
