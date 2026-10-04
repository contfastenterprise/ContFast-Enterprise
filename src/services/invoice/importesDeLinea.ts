/**
 * Lote 263: los importes de UNA linea de factura, en un solo sitio.
 *
 * `discount` es un descuento POR UNIDAD (la pantalla lo rotula "Desc. Unit."), asi que el descuento
 * de la linea es `cantidad x descuento`. La calculadora del servidor lo hacia bien; el XML del e-CF
 * que firma mSeller restaba el descuento UNA sola vez (`cantidad x precio - descuento`). Con
 * cantidad 1 da lo mismo; con mas, el comprobante fiscal se contradecia por dentro: `MontoItem`,
 * `MontoGravadoTotal` y los `MontoGravadoI*` salian con un descuento menor que el que descuentan
 * `TotalITBIS` y `MontoTotal`. Medido el 2026-10-03: tres comprobantes ACEPTADOS de Latin Doors
 * (E320000000043, E320000000046, E310000000012) lo llevan.
 *
 * Por eso la regla vive aqui y la usan los dos: si la calculadora y el XML la escribieran cada uno
 * a su manera, se volverian a separar. Redondeo al centavo en cada paso, el de siempre
 * (`roundMoney`), para que el XML cuadre al centavo con los totales guardados.
 */
import { roundMoney } from '@/utils/calculos';

export interface LineaConDescuento {
  quantity: number;
  unitPrice: number;
  /** Descuento por unidad, en pesos. */
  discount?: number | null;
}

export interface ImportesDeLinea {
  /** cantidad x precio */
  subtotal: number;
  /** cantidad x descuento por unidad: el descuento TOTAL de la linea */
  descuento: number;
  /** subtotal - descuento: la base sobre la que se cobra el ITBIS */
  base: number;
}

export function importesDeLinea(l: LineaConDescuento): ImportesDeLinea {
  const subtotal = roundMoney(l.quantity * l.unitPrice);
  const descuento = roundMoney(l.quantity * (l.discount || 0));
  return { subtotal, descuento, base: roundMoney(subtotal - descuento) };
}
