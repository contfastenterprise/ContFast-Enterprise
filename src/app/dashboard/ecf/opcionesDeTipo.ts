/**
 * LOTE 285: las opciones de tipo de comprobante de la Central e-CF, derivadas del catalogo.
 *
 * El mapa de nombres de esta pantalla se arreglo en su dia (el 46 y el 47 estaban cruzados), pero los
 * DESPLEGABLES seguian escritos a mano, y con el mismo cruce: al crear una secuencia, "E46 —
 * Comprobante para Pagos al Exterior" (el 46 es Exportaciones) y "E47 — Comprobante de Exportacion"
 * (el 47 es Pagos al Exterior); y en el filtro de la lista, "e-46 Pagos al Exterior" y "e-47
 * Exportacion". Una secuencia de exportaciones se creaba eligiendo "Pagos al Exterior". La causa es
 * la copia: aqui las opciones salen del catalogo unico (`services/dgii/tiposComprobante.ts`) y de
 * la serie B, y la pantalla no escribe ningun nombre.
 *
 * Fuera de la pagina para poder EJECUTARLO en el banco (`scratch/verificar_desfases_del_manual.ts`).
 */
import { TIPOS_COMPROBANTE } from '@/services/dgii/tiposComprobante';

export interface OpcionDeTipo {
  valor: string;
  rotulo: string;
}

/**
 * La numeracion anterior (serie B), que no es e-CF y no vive en el catalogo electronico.
 *
 * Lista ORDENADA y no objeto: "11" a "17" son indices enteros para JavaScript, y un `Object.entries`
 * los pondria delante del "01".
 */
export const NCF_B: readonly (readonly [string, string])[] = [
  ['01', 'Factura de Crédito Fiscal'],
  ['02', 'Factura de Consumo'],
  ['03', 'Nota de Débito'],
  ['04', 'Nota de Crédito'],
  ['11', 'Comprobante de Compras'],
  ['13', 'Comprobante para Gastos Menores'],
  ['14', 'Comprobante de Regímenes Especiales'],
  ['15', 'Comprobante Gubernamental'],
  ['16', 'Comprobante de Exportación'],
  ['17', 'Comprobante para Pagos al Exterior'],
];

/** Codigo -> nombre, de las dos series. Para pintar el tipo de una secuencia ya creada. */
export const ETIQUETAS_DE_TIPO: Record<string, string> = {
  ...Object.fromEntries(NCF_B),
  ...Object.fromEntries(TIPOS_COMPROBANTE.map((t) => [t.codigo, t.nombre])),
};

/**
 * El desplegable de crear secuencia: los diez electronicos (se pueden registrar secuencias de todos,
 * tambien de los que no se emiten desde ventas) o los diez de la serie B. Los mismos que antes.
 */
export function opcionesDeSecuencia(electronico: boolean): OpcionDeTipo[] {
  return electronico
    ? TIPOS_COMPROBANTE.map((t) => ({ valor: t.codigo, rotulo: `E${t.codigo} — ${t.nombre}` }))
    : NCF_B.map(([codigo, nombre]) => ({ valor: codigo, rotulo: `B${codigo} — ${nombre}` }));
}

/**
 * El filtro de tipo de la lista. Antes: los emitibles del catalogo y, escritos a mano detras, el 46
 * otra vez (con el nombre del 47) y el 47 (con el del 46). Se conserva lo que se ofrecia -- los
 * emitibles y el 47, que no se emite pero puede llegar registrado -- sin el 46 repetido.
 */
export function opcionesDelFiltro(): OpcionDeTipo[] {
  return TIPOS_COMPROBANTE.flatMap((t) =>
    t.emitible || t.codigo === '47' ? [{ valor: t.codigo, rotulo: `e-${t.codigo} ${t.corto}` }] : []);
}
