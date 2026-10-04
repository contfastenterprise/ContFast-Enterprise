/**
 * Lote 266: al reabrir un borrador de factura, los precios que cambiaron desde que se guardo.
 *
 * Pedido del dueño (2026-10-03): *"si hay una factura en borrador y los precios de los productos se
 * actualizaron, al reabrir el borrador para emitir la factura o editarlo debe tener la opcion de
 * actualizar los precios"*. Eligio: un AVISO con boton (no cambiarlos solo: en un borrador no se
 * distingue un precio que quedo viejo de uno que alguien acordo a mano), y GUARDAR el nivel de cada
 * linea para saber que precio le toca.
 *
 * Puro, para que un banco lo ejecute. La pantalla le pasa las lineas del borrador y el catalogo de
 * ahora.
 */
import { precioDeNivel, type NivelDePrecio, type PreciosDelProducto } from '@/services/precios/cambioDeTasa';

export const NIVELES_DE_PRECIO: readonly NivelDePrecio[] = ['base', 'consumidor', 'mayorista', 'proveedor'];

export function esNivelDePrecio(v: unknown): v is NivelDePrecio {
  return typeof v === 'string' && (NIVELES_DE_PRECIO as readonly string[]).includes(v);
}

const mismoImporte = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

/**
 * El nivel de una linea que no lo guardo (borradores de antes de la migracion 0019): el nivel cuyo
 * precio de HOY coincide con el guardado, probando primero consumidor -- el de siempre -- y luego
 * base, mayorista y proveedor. Si ninguno coincide (el precio cambio, o se puso a mano), consumidor:
 * lo que hacia la pantalla antes de este lote.
 */
export function nivelDeducido(precioGuardado: number, producto: PreciosDelProducto | undefined): NivelDePrecio {
  if (producto) {
    for (const nivel of ['consumidor', 'base', 'mayorista', 'proveedor'] as const) {
      const p = precioDeNivel(producto, nivel);
      if (p > 0 && mismoImporte(p, precioGuardado)) return nivel;
    }
  }
  return 'consumidor';
}

export interface LineaDelBorrador {
  productId?: string;
  productName?: string;
  priceTier?: NivelDePrecio;
  unitPrice: number;
}

export interface PrecioViejo {
  /** Posicion de la linea en la factura. */
  indice: number;
  nombre: string;
  nivel: NivelDePrecio;
  guardado: number;
  actual: number;
}

/** Las lineas cuyo precio guardado no es el de su nivel en el catalogo de ahora. */
export function preciosViejos(
  lineas: readonly LineaDelBorrador[],
  catalogo: ReadonlyMap<string, PreciosDelProducto>,
): PrecioViejo[] {
  return lineas.flatMap((l, indice) => {
    const producto = l.productId ? catalogo.get(l.productId) : undefined;
    if (!producto || !l.priceTier) return [];
    const actual = precioDeNivel(producto, l.priceTier);
    if (actual <= 0 || mismoImporte(actual, l.unitPrice)) return [];
    return [{ indice, nombre: l.productName || 'Producto', nivel: l.priceTier, guardado: l.unitPrice, actual }];
  });
}

/**
 * Las lineas con los precios de ahora. Solo cambia la linea que SIGUE con el precio guardado: si
 * alguien la toco despues de abrir el aviso, manda lo que escribio.
 */
export function conPreciosActuales<L extends LineaDelBorrador>(lineas: readonly L[], viejos: readonly PrecioViejo[]): L[] {
  const porIndice = new Map(viejos.map((v) => [v.indice, v]));
  return lineas.map((l, i) => {
    const v = porIndice.get(i);
    return v && mismoImporte(l.unitPrice, v.guardado) ? { ...l, unitPrice: v.actual } : l;
  });
}
