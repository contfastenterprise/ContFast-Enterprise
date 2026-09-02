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
 * Sin fecha no se emite -- PERO SOLO EN LOS TIPOS QUE LA LLEVAN. Un comprobante
 * que no puede decir hasta cuando esta autorizada su secuencia no es un
 * comprobante que se pueda presentar, y detenerse con un mensaje claro es
 * reparable; declarar una fecha falsa a la DGII no lo es.
 *
 * HAY TIPOS QUE NO LLEVAN LA FECHA, Y ESO NO ES UNA AUSENCIA
 * ----------------------------------------------------------
 * La DGII marca `FechaVencimientoSecuencia` como **No Aplica** en el e-32
 * (Consumo), el e-34 (Nota de Credito) y el e-47. En esos tres, no tener fecha
 * es lo correcto: el campo no va en el documento.
 *
 * La primera version de este fichero lanzaba en cuanto faltaba la fecha, sin
 * mirar el tipo. Eso convertia el arreglo en un fallo peor que el original:
 * el e-32 es la factura mas comun del sistema, y habria dejado de emitirse
 * entera por exigir un dato que su formato no admite. La correccion de un
 * valor inventado no puede consistir en exigirlo donde no existe.
 *
 * Devolver `null` -- y no una cadena vacia ni un hueco -- es lo que deja que
 * quien arma el payload OMITA el campo, que es lo que pide el formato.
 *
 * Vive en un solo sitio a proposito: la logica estaba duplicada en dos
 * ficheros, y esa duplicacion es la razon de que el valor fijo sobreviviera
 * tanto -- arreglarlo en uno dejaba el otro igual.
 */
import { exigeVencimientoSecuencia } from './tiposComprobante';

/** dd-MM-aaaa, que es lo que espera la DGII. */
function aFechaDgii(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * La fecha de vencimiento de la secuencia en formato dd-MM-aaaa.
 *
 *   - `null` en los tipos donde el campo **No Aplica** (e-32, e-34, e-47).
 *     Quien arma el payload debe OMITIR el campo, no mandarlo vacio.
 *   - La fecha, en los tipos que la llevan.
 *   - Lanza si el tipo la lleva y no consta: no hay valor por defecto.
 */
export function vencimientoSecuencia(
  seq: { sequenceExpiry?: string | null; expiryDate?: Date | string | null } | null | undefined,
  ecfType: string
): string | null {
  // El tipo manda. Aunque la secuencia tuviera una fecha cargada, en un e-32 o
  // un e-34 el campo no va en el documento: devolverla haria que se enviara.
  if (!exigeVencimientoSecuencia(ecfType)) return null;

  const explicita = seq?.sequenceExpiry?.trim();
  if (explicita) return explicita;

  if (seq?.expiryDate) {
    const d = new Date(seq.expiryDate as any);
    if (!Number.isNaN(d.getTime())) return aFechaDgii(d);
  }

  throw new Error(
    `La secuencia e-CF de tipo e-${ecfType} no tiene fecha de vencimiento configurada, ` +
    'y este tipo de comprobante la exige. ' +
    'Cargue la fecha de su autorizacion de la DGII en Ajustes > Secuencias antes de emitir. ' +
    'No se envia el comprobante con una fecha supuesta.'
  );
}
