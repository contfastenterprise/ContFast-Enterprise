/**
 * Lote 247: precios atados al dolar. Las REGLAS, puras: sin base, sin red y sin
 * React, para que la pantalla y el servidor calculen lo mismo y el banco pueda
 * ejecutarlas.
 *
 * Decidido por el dueno (2026-10-02): la tasa es PROPIA de la empresa y la
 * escribe el cada dia; el costo en dolares se fija POR PRODUCTO; y los precios
 * no cambian solos: se ensena lo que cambiaria y se aplica con su confirmacion.
 *
 * Lo que hace una actualizacion, y lo que no:
 *
 *   · el COSTO de catalogo pasa a `costo en dolares x tasa`. Es el costo de
 *     reposicion: el que frena una venta por debajo del costo. NO es el costo
 *     promedio del kardex, que es el que se asienta como costo de venta y solo
 *     lo mueven las compras;
 *   · cada PRECIO conserva el margen que tenia sobre el costo anterior. Un
 *     producto con margen propio no vuelve al margen de fabrica por subir el
 *     dolar;
 *   · el precio de OFERTA no se toca (lo puso alguien a mano, con una intencion):
 *     si queda por debajo del costo nuevo, se avisa;
 *   · nada de lo ya emitido cambia: facturas y cotizaciones guardan su precio.
 */

/** Los margenes de fabrica del formulario de productos ("Autocalcular"). */
export const MARGENES_POR_DEFECTO = {
  price: 1.25,
  priceConsumidor: 1.2,
  priceMayorista: 1.15,
  priceProveedor: 1.1,
} as const;

export type ClaveDePrecio = keyof typeof MARGENES_POR_DEFECTO;
export const CLAVES_DE_PRECIO = Object.keys(MARGENES_POR_DEFECTO) as ClaveDePrecio[];

/** Tope de cordura de la tasa: mas de esto es una coma mal puesta. */
export const TASA_MAXIMA = 1000;
const COSTO_USD_MAXIMO = 10_000_000;

export type Importes = { cost: number } & Record<ClaveDePrecio, number>;

export type ProductoAtado = Importes & {
  costoUsd: number;
  /** Lote 258: el precio base en dolares, si lo tiene. Con el, precio base = precio en dolares x tasa. */
  precioUsd?: number | null;
  /** Precio de oferta vigente, si el producto esta en oferta. */
  oferta?: number | null;
};

export type Calculo = {
  antes: Importes;
  despues: Importes;
  /** Si aplicar cambiaria algun importe. */
  cambia: boolean;
  /** Lo que el dueno tiene que saber antes de confirmar. */
  avisos: string[];
};

/** Una tasa escrita: el dia de RD (AAAA-MM-DD) y los pesos por dolar. */
export type Tasa = { fecha: string; tasa: number };

/** Un producto atado al dolar, con lo que cambiaria a la tasa vigente. */
export type Renglon = {
  productId: string;
  sku: string | null;
  name: string;
  costoUsd: number;
  /** Lote 258: el precio base en dolares; `null` si no tiene. */
  precioUsd: number | null;
  /** El costo y los precios que tiene HOY en el catalogo. */
  actual: Importes;
  /** La tasa con la que se calcularon sus precios la ultima vez; `null` si nunca. */
  tasaAplicada: number | null;
  /** `null` mientras no haya ninguna tasa escrita. */
  calculo: Calculo | null;
};

const aCentavos = (n: number) => Math.round((n + Number.EPSILON) * 100);

/** A dos decimales, sin que 1,005 se quede en 1,00. */
export const redondear = (n: number): number => aCentavos(n) / 100;

/**
 * Lee un numero escrito a mano: admite coma decimal ("63,50") y espacios.
 * Devuelve `null` si no es un numero.
 */
function leerNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '' || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const cuatroDecimales = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

export type Leida = { bien: true; valor: number } | { bien: false; mensaje: string };

/** La tasa: pesos por un dolar, mayor que cero, hasta cuatro decimales. */
export function leerTasa(v: unknown): Leida {
  const n = leerNumero(v);
  if (n === null) return { bien: false, mensaje: 'La tasa debe ser un número, por ejemplo 63.50.' };
  if (n <= 0) return { bien: false, mensaje: 'La tasa debe ser mayor que cero.' };
  if (n > TASA_MAXIMA) return { bien: false, mensaje: `La tasa no puede pasar de ${TASA_MAXIMA} pesos por dólar.` };
  return { bien: true, valor: cuatroDecimales(n) };
}

/**
 * Lote 258: el precio base en dolares. Vacio es "sin precio en dolares" (`valor: null`); si no,
 * mayor que cero y hasta cuatro decimales.
 */
export function leerPrecioUsd(v: unknown): { bien: true; valor: number | null } | { bien: false; mensaje: string } {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return { bien: true, valor: null };
  const n = leerNumero(v);
  if (n === null) return { bien: false, mensaje: 'El precio en dólares debe ser un número.' };
  if (n <= 0) return { bien: false, mensaje: 'El precio en dólares debe ser mayor que cero.' };
  if (n > COSTO_USD_MAXIMO) return { bien: false, mensaje: 'El precio en dólares es demasiado alto.' };
  return { bien: true, valor: cuatroDecimales(n) };
}

/** El costo en dolares de un producto: mayor que cero, hasta cuatro decimales. */
export function leerCostoUsd(v: unknown): Leida {
  const n = leerNumero(v);
  if (n === null) return { bien: false, mensaje: 'El costo en dólares debe ser un número.' };
  if (n <= 0) return { bien: false, mensaje: 'El costo en dólares debe ser mayor que cero.' };
  if (n > COSTO_USD_MAXIMO) return { bien: false, mensaje: 'El costo en dólares es demasiado alto.' };
  return { bien: true, valor: cuatroDecimales(n) };
}

/**
 * Los importes de un producto a una tasa.
 *
 * El margen de cada precio se conserva: `precio nuevo = precio x costo nuevo /
 * costo anterior`. Aplicar dos veces la misma tasa no cambia nada (el costo
 * anterior ya es el nuevo). Dos casos sin margen que conservar:
 *
 *   · costo anterior en cero: no hay margen que leer, se usan los de fabrica;
 *   · un precio en cero: no esta configurado, y se queda en cero. Inventarle un
 *     precio a un nivel que la empresa no usa lo pondria a la venta.
 */
export function calcular(p: ProductoAtado, tasa: number): Calculo {
  const antes: Importes = {
    cost: p.cost,
    price: p.price,
    priceConsumidor: p.priceConsumidor,
    priceMayorista: p.priceMayorista,
    priceProveedor: p.priceProveedor,
  };
  const cost = redondear(p.costoUsd * tasa);
  const despues: Importes = { ...antes, cost };

  for (const clave of CLAVES_DE_PRECIO) {
    if (p.cost > 0) {
      despues[clave] = p[clave] > 0 ? redondear((p[clave] * cost) / p.cost) : 0;
    } else {
      despues[clave] = redondear(cost * MARGENES_POR_DEFECTO[clave]);
    }
  }
  //  Lote 258: con precio base en dolares, el precio base sale de el y no del margen. Los otros tres
  //  niveles siguen conservando su margen sobre el costo (decision del dueño, 2026-10-03).
  if (p.precioUsd && p.precioUsd > 0) despues.price = redondear(p.precioUsd * tasa);

  const avisos: string[] = [];
  if (p.cost <= 0) {
    avisos.push('No tenía costo: los precios salen con los márgenes de fábrica (25, 20, 15 y 10 %).');
  }
  for (const clave of CLAVES_DE_PRECIO) {
    if (despues[clave] > 0 && despues[clave] < cost) {
      avisos.push('Queda algún precio por debajo del costo nuevo: no se podrá facturar a ese precio.');
      break;
    }
  }
  if (p.oferta && p.oferta > 0 && p.oferta < cost) {
    avisos.push('El precio de oferta queda por debajo del costo nuevo. La oferta no se cambia sola.');
  }

  const cambia = (Object.keys(antes) as (keyof Importes)[])
    .some((k) => aCentavos(antes[k]) !== aCentavos(despues[k]));
  return { antes, despues, cambia, avisos };
}

/** En cuanto sube o baja el precio base, en porcentaje (un decimal). */
export function variacion(c: Calculo): number | null {
  if (c.antes.price <= 0) return null;
  return Math.round(((c.despues.price - c.antes.price) / c.antes.price) * 1000) / 10;
}

/**
 * Lo que la pantalla confirma tiene que ser lo que el servidor aplica: la
 * confirmacion viaja con la tasa que se VIO. Si mientras tanto alguien escribio
 * otra, se rechaza en vez de aplicar unos precios que nadie miro.
 */
export function mismaTasa(vista: unknown, vigente: number): boolean {
  const leida = leerTasa(vista);
  return leida.bien && Math.round(leida.valor * 10_000) === Math.round(vigente * 10_000);
}

/** Cuantos dias lleva la tasa sin tocarse (0 = es de hoy). `hoy` y `fecha`, AAAA-MM-DD. */
export function diasDeLaTasa(fecha: string, hoy: string): number {
  const a = Date.parse(`${fecha}T12:00:00Z`);
  const b = Date.parse(`${hoy}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const TASA = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });

/**
 * Una tasa o un costo en dolares para ensenar: dos decimales siempre (es dinero:
 * "63.5" se lee raro) y hasta cuatro si los tiene. Sin separador de miles, para
 * que lo que se ensena se pueda volver a escribir en el campo tal cual.
 */
export const escribirTasa = (t: number): string => TASA.format(t);

const PESOS = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un importe en pesos, como en el resto de la aplicacion: 1,234.50 */
export const enPesos = (n: number): string => PESOS.format(n);

/** Lote 256: cuantos productos enseña cada pagina de la tabla de precios en dolares. */
export const PRODUCTOS_POR_PAGINA = 15;

/**
 * El trozo de la lista que se ve en una pagina. La pagina se ACOTA: si la lista encoge (se suelta
 * un producto y la ultima pagina se queda vacia), se ensena la ultima que existe en vez de una vacia.
 */
export function trozoDePagina<T>(lista: T[], pagina: number, porPagina = PRODUCTOS_POR_PAGINA): { visibles: T[]; pagina: number; paginas: number } {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { visibles: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, paginas };
}

/**
 * Lote 257: el costo con que entra un producto a una compra. Si sigue al dolar y hay tasa, el costo
 * en dolares por la tasa VIGENTE (no el de catalogo, que solo se pone al dia al "Aplicar precios");
 * si no, el de catalogo de siempre.
 */
export function costoParaCompra(costoCatalogo: unknown, costoUsd: number | null | undefined, tasa: number | null | undefined): number {
  if (costoUsd && costoUsd > 0 && tasa && tasa > 0) return redondear(costoUsd * tasa);
  const n = Number(costoCatalogo);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
