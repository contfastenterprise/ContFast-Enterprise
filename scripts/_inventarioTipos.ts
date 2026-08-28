/**
 * Tipos compartidos por el diagnostico de inventario y la carga de conteo.
 *
 * Viven aparte porque los tres modulos (`_inventarioDatos`, `_inventarioInforme`
 * y el propio `inventario_negativo`) los necesitan, y hacerlos depender unos de
 * otros solo por una interfaz crearia un ciclo de imports.
 */
export type Modo = 'PRODUCCION' | 'PRUEBA';

export interface Nivel {
  levelId: string | null; // null = el producto no tiene fila de nivel todavia
  companyId: string;
  companyName?: string;
  modo: Modo;
  productId: string;
  productName: string;
  sku: string | null;
  activo: boolean;
  cost: number;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

/** Una linea del plan de carga: de `quantity` a `contado`. */
export interface Ajuste extends Nivel {
  contado: number;
  diferencia: number;
  /** Valor de la diferencia al costo. Informativo: no genera asiento. */
  valor: number;
}

export const CERO = 0.00005; // tolerancia: la columna es decimal(15,4)

/** El plan de carga completo: lo que se escribe y lo que hay que avisar. */
export interface Plan {
  ajustes: Ajuste[];      // hay diferencia: se escribe
  iguales: Ajuste[];      // el conteo coincide: no se toca
  nuevos: Ajuste[];       // contado sin fila de nivel: se crea
  desconocidos: { sku: string; cantidad: number; lineas: number[] }[]; // SKU que no existe
  sinInventario: { sku: string; nombre: string; cantidad: number }[];  // servicios y venta por encargo
  noContados: Nivel[];    // hay nivel pero el CSV no lo menciona
  repetidos: { sku: string; lineas: number[]; total: number }[];
  // `sku` en todos ellos es el texto TAL COMO viene en el CSV: el usuario va a
  // buscarlo en su fichero, y devolverselo en minusculas parece otro codigo.
}
