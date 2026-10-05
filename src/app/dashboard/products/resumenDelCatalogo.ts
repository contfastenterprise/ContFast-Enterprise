/**
 * LOTE 291: la peticion de las tarjetas de Productos ("Stock Bajo" y "Valor de Inventario").
 *
 * Fuera de `page.tsx` (2.500 lineas) para que el banco la EJECUTE contra un `fetch` sustituido. Una
 * sola peticion para las dos tarjetas (`/api/v1/products/resumen`). Si falla -- red, 403, 5xx, un 2xx
 * sin `success` --, devuelve `null` y las dos tarjetas dicen "—": un cero se leeria como "no hay
 * nada bajo" o "el inventario no vale nada", y no se sabe.
 */
import { leerRespuesta } from '@/utils/leerRespuesta';

export interface ResumenDelCatalogo {
  stockBajo: number;
  /** Existencia x costo promedio del kardex, catalogo entero, en pesos. */
  valorInventario: number;
  /** Niveles con existencia y costo promedio 0: valen 0 en la suma. */
  nivelesSinCosto: number;
}

export async function pedirResumenDelCatalogo(
  pedir: typeof fetch = fetch
): Promise<ResumenDelCatalogo | null> {
  try {
    const leido = await leerRespuesta<{ data: Partial<ResumenDelCatalogo> }>(await pedir('/api/v1/products/resumen'));
    //  Mutante equivalente, anotado: sin esta linea, leer `cuerpo` de un fallo lanza y el `catch` da
    //  el mismo `null`. Se deja porque no depender de un error para decidir es lo que se quiere decir.
    if (!leido.bien) return null;
    const d = leido.cuerpo.data ?? {};
    if (typeof d.stockBajo !== 'number' || typeof d.valorInventario !== 'number') return null;
    return {
      stockBajo: d.stockBajo,
      valorInventario: d.valorInventario,
      nivelesSinCosto: typeof d.nivelesSinCosto === 'number' ? d.nivelesSinCosto : 0,
    };
  } catch {
    return null;
  }
}
