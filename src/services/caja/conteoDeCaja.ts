/**
 * El arqueo de caja: contar lo que hay, no escribir lo que deberia haber.
 *
 * POR QUE EXISTE (lote 172)
 * -------------------------
 * Cerrar una caja era una formalidad. Medido el 2026-09-20 en Latin Doors: las
 * TRES sesiones cerradas cuadran al centavo y ninguna lleva justificacion.
 *
 *   03/07 -> 06/08 (34 dias): esperado 1.200.825,01, contado 1.200.825,01
 *   06/08 -> 19/09 (44 dias): esperado 2.204.992,49, contado 2.204.992,49
 *
 * Y los importes llevan centimos. Los billetes son enteros: el unico campo que
 * admitia decimales era "Total Monedas", libre y sin tope. Es decir, alguien
 * escribio 2.204.992,49 en el campo de monedas. Eso no es un arqueo, es copiar
 * el esperado -- con 85.000,00 reales en la caja.
 *
 * Tres agujeros, y este lote los cierra los tres:
 *
 *   1. EL DESGLOSE NO SE GUARDABA. Solo viajaba el total, asi que despues no
 *      habia nada que auditar: ni cuantos billetes de 1.000, ni nada.
 *   2. EL TOTAL LO MANDABA EL CLIENTE. El servidor aceptaba cualquier
 *      `actualBalance`. Ahora el total se CALCULA aqui a partir del desglose:
 *      no hay forma de mandar un importe que no se componga de billetes y
 *      monedas contados.
 *   3. LA PANTALLA ENSEÑABA EL ESPERADO MIENTRAS CONTABAS. El arqueo pasa a
 *      ser CIEGO (decision del dueño, 2026-09-20): el esperado y la diferencia
 *      salen al cerrar, no antes.
 *
 * CONSECUENCIA DEL ARQUEO CIEGO, dicha en voz alta: el cierre ya NO se niega
 * cuando hay diferencia. Antes se negaba pidiendo justificacion... y el mensaje
 * del error decia el importe de la diferencia, con lo que bastaba volver atras
 * y ajustar el conteo para que cuadrara. Cualquier freno que responda "no
 * cuadra" filtra justo lo que el arqueo ciego oculta. Asi que la diferencia se
 * REGISTRA y la sesion queda cerrada y pendiente de aprobacion: es un hecho que
 * hay que explicar, no un obstaculo que invite a retocar el conteo.
 *
 * Sin base de datos: lo usan la ruta, el servicio y la pantalla.
 */

export interface Denominacion {
  /** Valor en pesos. Entero: no hay billetes ni monedas con centimos en RD. */
  valor: number;
  etiqueta: string;
  tipo: 'billete' | 'moneda';
}

/**
 * Los billetes y monedas de curso legal en Republica Dominicana.
 *
 * Las MONEDAS estan aqui desde el lote 172. Antes la pantalla solo desglosaba
 * billetes y remataba con un campo libre "Total Monedas", que es por donde
 * entraron los 2,2 M. Contar monedas por denominacion es mas trabajo, y es el
 * trabajo que un arqueo es (decision del dueño, 2026-09-20).
 */
export const DENOMINACIONES: readonly Denominacion[] = [
  { valor: 2000, etiqueta: 'RD$ 2,000', tipo: 'billete' },
  { valor: 1000, etiqueta: 'RD$ 1,000', tipo: 'billete' },
  { valor: 500, etiqueta: 'RD$ 500', tipo: 'billete' },
  { valor: 200, etiqueta: 'RD$ 200', tipo: 'billete' },
  { valor: 100, etiqueta: 'RD$ 100', tipo: 'billete' },
  { valor: 50, etiqueta: 'RD$ 50', tipo: 'billete' },
  { valor: 25, etiqueta: 'RD$ 25', tipo: 'moneda' },
  { valor: 10, etiqueta: 'RD$ 10', tipo: 'moneda' },
  { valor: 5, etiqueta: 'RD$ 5', tipo: 'moneda' },
  { valor: 1, etiqueta: 'RD$ 1', tipo: 'moneda' },
];

const VALORES = new Set(DENOMINACIONES.map((d) => d.valor));

/** Lo contado de una denominacion. */
export interface LineaDeConteo {
  denominacion: number;
  cantidad: number;
}

/**
 * El total contado, en pesos. Se calcula SIEMPRE aqui -- tambien en el
 * servidor --, nunca se recibe: un total recibido es un numero que nadie conto.
 *
 * En enteros: una cantidad por un valor entero no puede dar centimos, asi que
 * no hay error de coma flotante que arrastrar.
 */
export function totalDelConteo(conteo: readonly LineaDeConteo[]): number {
  return conteo.reduce((suma, l) => suma + l.denominacion * l.cantidad, 0);
}

/**
 * Por que ese conteo no vale, o null si vale.
 *
 * "Todo a cero" SI vale: una caja puede estar vacia, y negarlo obligaria a
 * inventarse un billete. Lo que no vale es no mandar nada, que es lo que hace
 * un cliente que se salto el formulario.
 */
export function motivoParaNoContar(conteo: readonly LineaDeConteo[] | undefined | null): string | null {
  if (!Array.isArray(conteo) || conteo.length === 0) {
    return 'Registre el conteo de la caja: cuántos billetes y monedas de cada denominación hay.';
  }
  const vistas = new Set<number>();
  for (const l of conteo) {
    if (!VALORES.has(l.denominacion)) {
      return `RD$ ${l.denominacion} no es una denominación de curso legal.`;
    }
    if (vistas.has(l.denominacion)) {
      return `La denominación RD$ ${l.denominacion} viene dos veces en el conteo.`;
    }
    vistas.add(l.denominacion);
    if (!Number.isInteger(l.cantidad) || l.cantidad < 0) {
      return `La cantidad de RD$ ${l.denominacion} tiene que ser un número entero de billetes o monedas, y no puede ser negativa.`;
    }
  }
  if (vistas.size !== DENOMINACIONES.length) {
    return 'El conteo tiene que incluir todas las denominaciones, aunque la cantidad sea cero.';
  }
  return null;
}

/** El arqueo ya hecho: lo contado, lo esperado y lo que sobra o falta. */
export interface Arqueo {
  contado: number;
  esperado: number;
  /** Contado menos esperado. Positivo: sobra. Negativo: falta. */
  diferencia: number;
  /** Una diferencia hay que explicarla; no impide cerrar (ver la cabecera). */
  requiereAprobacion: boolean;
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * Un cobro que NO entro en la caja: transferencia, cheque, tarjeta.
 *
 * POR QUE CUENTAN EN EL CUADRE SIN CONTAR EN EL EFECTIVO (lote 172)
 * ----------------------------------------------------------------
 * Pedido por el dueño el 2026-09-20, y la medicion le da la razon de sobra. En
 * PRODUCCION hay 18 cobros marcados como EFECTIVO por 3.257.815,89 -- entre
 * ellos uno de 602.000,00, otro de 550.000,00 y dos de 400.000,00. Nadie paga
 * medio millon en billetes: son transferencias anotadas como efectivo, porque
 * hasta el lote 151 el cobro ni siquiera podia decir por que banco entro. Esos
 * cobros subieron el ESPERADO de la caja y son la razon de que una sesion
 * "esperara" 2.204.992,49 con 85.000,00 reales dentro.
 *
 * La regla, entonces:
 *   - a credito: no entra en el cuadre de caja. No hay dinero todavia.
 *   - por transferencia o cheque: NO se cuenta como efectivo -- no esta en la
 *     caja --, pero SI aparece en el cuadre, con su constancia, porque es
 *     dinero cobrado en esa sesion del que hay que responder.
 *   - en efectivo: se cuenta, y tiene que aparecer en el arqueo.
 */
export interface CobroNoEfectivo {
  id: string;
  forma: string;
  importe: number;
  /** El numero de transferencia o de cheque. Sin esto no hay de que responder. */
  constancia: string | null;
}

export interface ResumenDeTransferencias {
  total: number;
  /** Las que no traen constancia: no impiden cerrar, pero se señalan. */
  sinConstancia: CobroNoEfectivo[];
}

export function resumirTransferencias(cobros: readonly CobroNoEfectivo[]): ResumenDeTransferencias {
  const total = cobros.reduce((s, c) => s + centavos(c.importe), 0) / 100;
  return { total, sinConstancia: cobros.filter((c) => !c.constancia || !c.constancia.trim()) };
}

export function arquear(conteo: readonly LineaDeConteo[], esperado: number): Arqueo {
  const contado = totalDelConteo(conteo);
  // El esperado SI puede traer centimos (sale de sumar importes de venta), asi
  // que la resta se hace en centavos y no en pesos.
  const diferencia = (centavos(contado) - centavos(esperado)) / 100;
  return { contado, esperado, diferencia, requiereAprobacion: diferencia !== 0 };
}
