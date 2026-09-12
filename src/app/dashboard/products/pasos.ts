/**
 * Los tres pasos del alta de un producto, y QUE CAMPO DEL ESQUEMA vigila cada
 * uno.
 *
 * POR QUE VIVE AQUI Y NO EN `page.tsx`
 * -----------------------------------
 * Para poder probarlo. Dentro de `page.tsx` -- 2.200 lineas, `'use client'`,
 * framer-motion y cinco modales -- no hay forma de cargar esta tabla desde un
 * banco sin arrastrar media aplicacion. Aqui es codigo puro: ni React ni estado.
 * Es el mismo reparto que ya hacen `purchases/pasos.ts` (lote 82) e
 * `invoices/pasos.ts` (lote 87).
 *
 * QUE SON ESOS NOMBRES
 * --------------------
 * `campos` NO son variables de la pantalla: son rutas de error de
 * `esquemaProducto` (src/schemas/producto.ts). Por eso un paso no tiene reglas
 * propias -- se corre el MISMO esquema que valida el servidor y se mira si algo
 * de lo que fallo cae en este paso. Una sola verdad, imposible de
 * desincronizar. Este lote solo pudo hacerse DESPUES del 88, que es el que
 * saco ese esquema de dentro de las rutas.
 *
 * EL REPARTO TIENE QUE SER TOTAL
 * ------------------------------
 * Todo campo que el esquema pueda rechazar tiene que caer en EXACTAMENTE un
 * paso. Si alguno no cayera en ninguno, se podria guardar desde cualquier paso
 * con ese campo mal y el asistente no sabria a donde llevarte: el error se
 * pintaria en una pantalla que no estas mirando. Si cayera en dos, el mismo
 * fallo marcaria dos pasos. Lo comprueba
 * `scratch/verificar_productos_por_pasos.ts` ejecutando el esquema de verdad.
 *
 * `description` e `imageUrl` NO estan en el formulario -- el esquema los admite
 * porque la API si los acepta --, asi que desde esta pantalla no pueden fallar
 * nunca. Aun asi se reparten: el reparto es sobre el ESQUEMA, y dejar un hueco
 * "porque no se usa" es justo como se cuela el primero que si se use.
 *
 * POR QUE LOS CODIGOS DE BARRA VAN AL FINAL
 * -----------------------------------------
 * Es el bloque mas grande del formulario y el que menos gente toca, y encima
 * todo lo suyo es opcional. Ponerlo en medio obligaba a atravesarlo para llegar
 * al costo, que si es obligatorio.
 */
export const PASOS = [
  {
    n: 1,
    titulo: 'Qué es',
    campos: ['name', 'categoryId', 'unitOfMeasure', 'status', 'sku', 'description', 'imageUrl'],
  },
  {
    n: 2,
    titulo: 'Precios y existencia',
    campos: [
      'cost', 'price', 'priceConsumidor', 'priceProveedor', 'priceMayorista',
      'promotionalPrice', 'isOnSale', 'tracksInventory',
    ],
  },
  {
    n: 3,
    titulo: 'Códigos de barra',
    campos: ['barcode', 'secondaryBarcodes'],
  },
] as const;

/** Un campo cae en un paso si es suyo o cuelga de el (`secondaryBarcodes.0.barcode`). */
export const campoDelPaso = (campo: string, n: number): boolean => {
  const campos: readonly string[] = PASOS.find(p => p.n === n)?.campos ?? [];
  return campos.some(c => campo === c || campo.startsWith(c + '.'));
};

/**
 * El primer paso que tenga algo que corregir, o `null` si no falla nada.
 *
 * Es lo que hace que "Guardar" se pueda pulsar desde cualquier paso: si el
 * esquema rechaza algo, el asistente va solo al paso que lo contiene en vez de
 * dejar el error pintado en una pantalla que no estas viendo.
 */
export const primerPasoConFallo = (campos: readonly string[]): number | null => {
  for (const p of PASOS) {
    if (campos.some(c => campoDelPaso(c, p.n))) return p.n;
  }
  return null;
};
