/**
 * Lote 264: no se factura por debajo del costo, contando el DESCUENTO.
 *
 * La regla de siempre (servidor y pantalla) comparaba el precio unitario ANTES del descuento con el
 * costo: un precio de 100 sobre un costo de 90 con 20 de descuento pasaba, aunque se vendia a 80.
 * Medido el 2026-10-03: 3 lineas facturadas quedaron asi por debajo del costo de catalogo de hoy.
 * Decision del dueño (2026-10-03): IMPEDIRLO, no solo avisar.
 *
 * Vive aqui, pura, para que el servidor (que es el que impide de verdad) y la pantalla (que lo dice
 * en el campo antes de enviar) usen la misma cuenta. El descuento es POR UNIDAD (el campo "Desc.
 * Unit."), asi que el precio neto de una unidad es `precio - descuento`.
 *
 * El costo es el de catalogo (`products.cost`, sin ITBIS), el de siempre. Las notas de credito
 * siguen fuera: devuelven mercancia, no la venden.
 */
import { roundMoney } from '@/utils/calculos';

export interface PrecioDeLinea {
  unitPrice: number;
  /** Descuento por unidad, en pesos. */
  discount?: number | null;
}

/** Lo que se cobra por unidad: precio menos descuento por unidad. */
export function precioNeto(l: PrecioDeLinea): number {
  return roundMoney(Number(l.unitPrice) - (Number(l.discount) || 0));
}

/** Si la linea vende por debajo del costo. Sin costo (0) no hay contra que comparar. */
export function quedaPorDebajoDelCosto(l: PrecioDeLinea, costo: number): boolean {
  return costo > 0 && precioNeto(l) < costo;
}

/** El motivo, nombrando el descuento cuando es el que lo deja por debajo. */
export function motivoBajoCosto(l: PrecioDeLinea, costo: number, nombre?: string): string {
  const de = nombre ? ` de "${nombre}"` : '';
  const c = `RD$ ${costo.toFixed(2)}`;
  return (Number(l.discount) || 0) > 0
    ? `El precio con descuento${de} (RD$ ${precioNeto(l).toFixed(2)}) no puede ser inferior al costo (${c}).`
    : `El precio unitario${de} (RD$ ${Number(l.unitPrice).toFixed(2)}) no puede ser inferior al costo (${c}).`;
}
