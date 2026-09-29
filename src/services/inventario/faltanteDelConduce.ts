/**
 * Que le falta a un conduce para poder despacharse, y como se dice en el aviso.
 *
 * POR QUE ESTE FICHERO (lote 221)
 * -------------------------------
 * Facturar no descuenta existencia: la descuenta el CONDUCE al aprobarse, y ahi
 * mismo se asienta el costo de venta (`deliveryRepository`). Si el conduce
 * automatico no se puede aprobar -- "Inventario insuficiente" --, queda en
 * borrador, y la factura sigue emitida con su mercancia contando como si
 * estuviera en el almacen y sin costo de venta. Eso solo quedaba en el registro
 * de auditoria (`fallo_post_emision`), donde no lo mira nadie.
 *
 * Medido el 2026-09-28 en PRODUCCION: cinco conduces en borrador de facturas
 * aceptadas, del 10/09 al 25/09. Y no les faltaba lo mismo: a dos les faltaba
 * mercancia (1 puerta; 4 dinteles), dos ya tenian existencia porque se repuso
 * despues, y uno solo llevaba productos que no llevan inventario. Por eso el
 * aviso DISTINGUE "falta mercancia" de "ya se puede despachar", y dice que
 * producto y cuantas unidades -- pedido del dueño.
 *
 * LA REGLA ES LA DE LA APROBACION, no una copia: `alcanzaLaExistencia`
 * (existencia - pedido >= minimo del almacen), la misma que usa
 * `checkStockBatch`. Si el aviso contara distinto, diria "falta 1" de un
 * conduce que se aprueba, o al reves. Por lo mismo el MINIMO cuenta: un
 * conduce se puede frenar con unidades en el estante si dejarian el almacen por
 * debajo de su minimo, y el texto lo dice para que no parezca que falta
 * mercancia que si esta.
 *
 * Sin base de datos: aqui solo se decide.
 */
import { aCantidad, alcanzaLaExistencia } from './existencia';

/** Un renglon del conduce, con lo que hay en el almacen de su factura. */
export interface RenglonDelConduce {
  productId: string;
  nombre: string;
  sku: string | null;
  pedido: number | string;
  /** Lo que hay en el almacen de la factura. Sin nivel, 0. */
  existencia: number | string | null;
  minimo: number | string | null;
  /** Un servicio no tiene existencia: nunca frena un despacho. */
  llevaInventario: boolean;
}

export interface Faltante {
  productId: string;
  nombre: string;
  sku: string | null;
  pedido: number;
  existencia: number;
  minimo: number;
  /** Unidades que hay que añadir al almacen para poder despachar. */
  faltan: number;
}

/** Redondeo a las 4 decimales de la columna, para no enseñar 0.30000000000000004. */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Lo que falta, producto a producto. Vacio si el conduce ya se puede aprobar.
 *
 * El mismo producto en dos renglones pide la SUMA al mismo almacen (el arreglo
 * de `checkStockBatch`): mirarlos por separado diria que alcanza cuando no.
 */
export function faltantesDelConduce(renglones: RenglonDelConduce[]): Faltante[] {
  const porProducto = new Map<string, Faltante>();
  for (const r of renglones) {
    if (!r.llevaInventario) continue;
    const previo = porProducto.get(r.productId);
    if (previo) {
      previo.pedido = r4(previo.pedido + aCantidad(r.pedido));
    } else {
      porProducto.set(r.productId, {
        productId: r.productId,
        nombre: r.nombre,
        sku: r.sku,
        pedido: r4(aCantidad(r.pedido)),
        existencia: r4(aCantidad(r.existencia)),
        minimo: r4(aCantidad(r.minimo)),
        faltan: 0,
      });
    }
  }

  const faltantes: Faltante[] = [];
  for (const f of porProducto.values()) {
    if (alcanzaLaExistencia(f.existencia, f.minimo, f.pedido)) continue;
    faltantes.push({ ...f, faltan: r4(f.pedido + f.minimo - f.existencia) });
  }
  return faltantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Una cantidad sin ceros de relleno: "4", "2.5". */
function cantidad(n: number): string {
  return String(r4(n));
}

/**
 * Un faltante en una linea: "Dintel Caoba (PROD-000035): faltan 4 — pide 5, hay 1".
 * Con minimo, lo dice: si no, "hay 6" y "faltan 2" parecerian contradecirse.
 */
export function textoDelFaltante(f: Faltante): string {
  const nombre = f.sku ? `${f.nombre} (${f.sku})` : f.nombre;
  const verbo = f.faltan === 1 ? 'falta' : 'faltan';
  const minimo = f.minimo > 0 ? `, mínimo del almacén ${cantidad(f.minimo)}` : '';
  return `${nombre}: ${verbo} ${cantidad(f.faltan)} — pide ${cantidad(f.pedido)}, hay ${cantidad(f.existencia)}${minimo}`;
}

/** Cuantos faltantes se enumeran; el resto se cuenta. El aviso va tambien al correo. */
export const MAXIMO_EN_EL_AVISO = 5;

/** Titulo y descripcion del aviso de un conduce en borrador. */
export function avisoDelConduce(datos: {
  numero: string;
  ncf: string | null;
  faltantes: Faltante[];
  /**
   * Si algun producto del conduce lleva inventario. Medido: CON-2026-000044
   * solo llevaba productos que NO lo llevan, y decirle "ya hay existencia" o
   * "la mercancia sigue contando en el inventario" era falso.
   */
  llevaInventario: boolean;
}): { title: string; description: string } {
  const factura = datos.ncf ? `La factura ${datos.ncf} ya se emitió` : 'La factura ya se emitió';
  //  Cierto en todos los casos, lleve o no inventario: lo que no ocurre sin
  //  aprobar es el DESPACHO, y con el, el descuento y el costo de venta.
  const consecuencia =
    'mientras el conduce no se apruebe, la venta no se refleja en el inventario ni en el costo de venta.';

  if (datos.faltantes.length === 0) {
    const motivo = datos.llevaInventario
      ? 'Ya hay existencia para todo'
      : 'Sus productos no llevan inventario';
    return {
      title: `Conduce ${datos.numero} listo para despachar`,
      description: `${motivo}: se puede aprobar. ${factura}; ${consecuencia}`,
    };
  }

  const enumerados = datos.faltantes.slice(0, MAXIMO_EN_EL_AVISO).map(textoDelFaltante);
  const resto = datos.faltantes.length - enumerados.length;
  const lista = enumerados.join('; ') + (resto > 0 ? `; y ${resto} producto${resto === 1 ? '' : 's'} más` : '');
  return {
    title: `Conduce ${datos.numero} sin despachar: falta mercancía`,
    description: `${lista}. ${factura}; ${consecuencia}`,
  };
}
