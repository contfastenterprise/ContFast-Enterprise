/**
 * Los cuatro pasos de la emision de una factura, y QUE CAMPO DEL ESQUEMA vigila
 * cada uno.
 *
 * POR QUE VIVE AQUI Y NO EN `page.tsx`
 * -----------------------------------
 * Para poder probarlo. Dentro de `page.tsx` -- 3.200 lineas, `'use client'`,
 * framer-motion -- no hay forma de cargar esta tabla desde un banco sin
 * arrastrar media aplicacion. Aqui es codigo puro: ni React ni estado. Es el
 * mismo reparto que ya hace `purchases/pasos.ts` desde P2-35 en compras.
 *
 * QUE SON ESOS NOMBRES
 * --------------------
 * `campos` NO son variables de la pantalla: son rutas de error de
 * `esquemaFactura` (src/schemas/factura.ts). Por eso un paso no tiene reglas
 * propias -- se corre el MISMO esquema que valida el servidor y se mira si algo
 * de lo que fallo cae en este paso. Una sola verdad, imposible de
 * desincronizar.
 *
 * EL REPARTO TIENE QUE SER TOTAL
 * ------------------------------
 * Todo campo que el esquema pueda rechazar tiene que caer en EXACTAMENTE un
 * paso. Si alguno no cayera en ninguno, el asistente dejaria pasar los cuatro
 * pasos en verde y reventaria al emitir, que es el peor asistente posible: te
 * deja llegar hasta el final para decirte que no. Si cayera en dos, el mismo
 * error se pintaria dos veces. Lo comprueba
 * `scratch/verificar_facturas_por_pasos.ts` ejecutando el esquema de verdad
 * contra una factura vacia y contra una nota de credito sin motivo.
 *
 * POR QUE `indicadorNotaCredito` Y `modifiedNcf` VAN EN EL PASO 1
 * --------------------------------------------------------------
 * Porque los decide el TIPO de comprobante, que es lo primero que se elige. Una
 * nota de credito sin NCF modificado no es una factura a la que le falta un
 * dato: es un comprobante que todavia no sabe a que documento corrige. En el
 * paso 4 llegaria tarde -- y hasta ahora su error se pintaba, literalmente,
 * debajo de la tabla de articulos.
 *
 * POR QUE `warehouseId` VA EN EL PASO 3
 * -------------------------------------
 * Es el almacen del que sale la mercancia, y cada linea puede llevar el suyo
 * (ver el lote 86). El de la factura es el respaldo de las lineas que no
 * eligieron: pertenece a "que se vende y de donde sale", no al comprobante.
 *
 * EL PASO 4 NO VIGILA NADA, Y NO ES UN DESCUIDO
 * ---------------------------------------------
 * `notes` es opcional y las retenciones no pasan por `buildInvoicePayload`: el
 * esquema no las ve. El paso 4 no valida, REPASA -- y desde ahi se emite, que
 * es cuando se corre el esquema entero.
 */
export const PASOS = [
  {
    n: 1,
    titulo: 'El comprobante',
    campos: [
      'ecfType', 'paymentType', 'bankName', 'transactionNumber',
      'modifiedNcf', 'modifiedInvoiceId', 'indicadorNotaCredito',
      'cashSessionId', 'quoteId',
    ],
  },
  { n: 2, titulo: 'El cliente', campos: ['customerId', 'buyerRnc', 'buyerName'] },
  { n: 3, titulo: 'Los artículos', campos: ['lines', 'warehouseId'] },
  { n: 4, titulo: 'Revisar y emitir', campos: ['notes', 'retentions', 'ignoreCommunicationError'] },
] as const;

/** Un campo cae en un paso si es suyo o cuelga de el (`lines.0.unitPrice`). */
export const campoDelPaso = (campo: string, n: number): boolean => {
  const campos: readonly string[] = PASOS.find(p => p.n === n)?.campos ?? [];
  return campos.some(c => campo === c || campo.startsWith(c + '.'));
};

/** El primer paso que tenga algo que corregir, o `null` si no falla nada. */
export const primerPasoConFallo = (campos: readonly string[]): number | null => {
  for (const p of PASOS) {
    if (campos.some(c => campoDelPaso(c, p.n))) return p.n;
  }
  return null;
};
