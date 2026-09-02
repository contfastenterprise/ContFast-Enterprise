/**
 * La fecha de vencimiento de la secuencia e-CF: se lee, no se inventa.
 *
 * EL FALLO
 * --------
 * En los dos sitios que arman el e-CF -- la emision y el envio en diferido --
 * habia esto:
 *
 *     let sequenceExpiry = '31-12-2026';   // fallback
 *
 * Si la secuencia no traia fecha, se declaraba esa ante la DGII como
 * `FechaVencimientoSecuencia`. Es un dato fiscal fabricado, dentro del
 * comprobante, sin que nadie se entere.
 *
 * Y no era hipotetico: las secuencias e-32 y e-34 de produccion estaban sin
 * fecha, y 27 comprobantes e-32 salieron declarando el 31-12-2026. Se salvaron
 * porque iban al ambiente de pruebas.
 *
 * Ademas la fecha inventada caduca sola: pasado el 31-12-2026, cada
 * comprobante habria declarado una autorizacion vencida.
 *
 * LA REGLA
 * --------
 * Sin fecha no se emite. Un comprobante que no puede decir hasta cuando esta
 * autorizada su secuencia no es un comprobante que se pueda presentar, y
 * detenerse con un mensaje claro es reparable; declarar una fecha falsa a la
 * DGII no lo es.
 *
 * Vive en un solo sitio a proposito: la logica estaba duplicada en dos
 * ficheros, y esa duplicacion es la razon de que el valor fijo sobreviviera
 * tanto -- arreglarlo en uno dejaba el otro igual.
 */

/** dd-MM-aaaa, que es lo que espera la DGII. */
function aFechaDgii(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * Devuelve la fecha de vencimiento de la secuencia en formato dd-MM-aaaa.
 * Lanza si no consta: no hay valor por defecto.
 */
export function vencimientoSecuencia(
  seq: { sequenceExpiry?: string | null; expiryDate?: Date | string | null } | null | undefined,
  ecfType: string
): string {
  const explicita = seq?.sequenceExpiry?.trim();
  if (explicita) return explicita;

  if (seq?.expiryDate) {
    const d = new Date(seq.expiryDate as any);
    if (!Number.isNaN(d.getTime())) return aFechaDgii(d);
  }

  throw new Error(
    `La secuencia e-CF de tipo e-${ecfType} no tiene fecha de vencimiento configurada. ` +
    'Cargue la fecha de su autorizacion de la DGII en Ajustes > Secuencias antes de emitir. ' +
    'No se envia el comprobante con una fecha supuesta.'
  );
}
