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
 * Y LA FECHA SALIA UN DIA ANTES
 * -----------------------------
 * Cuando la fecha venia de la columna `expiry_date` -- que es una columna
 * `date`, o sea la cadena 'AAAA-MM-DD' -- esto la pasaba por `new Date(...)`
 * y la leia con los captadores locales. Medianoche UTC son las 20:00 del dia
 * ANTERIOR en Republica Dominicana, asi que a la DGII se le declaraba siempre
 * un dia menos: 336 de 336 fechas medidas. El caso peor era una secuencia que
 * vence el 1 de enero: se declaraba como del 31 de diciembre anterior, es
 * decir, una autorizacion ya vencida dentro del propio comprobante.
 *
 * El formateo vive ahora en fechaDgii.ts, que no construye ningun `Date`.
 *
 * Vive en un solo sitio a proposito: la logica estaba duplicada en dos
 * ficheros, y esa duplicacion es la razon de que el valor fijo sobreviviera
 * tanto -- arreglarlo en uno dejaba el otro igual.
 */
import { exigeVencimientoSecuencia } from './tiposComprobante';
import { fechaDgii, esFechaDgii } from './fechaDgii';

/**
 * La fecha de vencimiento de la secuencia en formato dd-MM-aaaa.
 *
 *   - `null` en los tipos donde el campo **No Aplica** (e-32, e-34, e-47).
 *     Quien arma el payload debe OMITIR el campo, no mandarlo vacio.
 *   - La fecha, en los tipos que la llevan.
 *   - Lanza si el tipo la lleva y no consta: no hay valor por defecto.
 */
type Secuencia = { sequenceExpiry?: string | null; expiryDate?: Date | string | null } | null | undefined;

/**
 * La fecha de vencimiento SI CONSTA, sin parar nada. Para IMPRIMIR.
 *
 * Emitir e imprimir no son lo mismo, y por eso hay dos funciones:
 *
 *   EMITIR    se para. Un comprobante que todavia no existe y al que le falta
 *             un dato fiscal no se manda; pararse es reparable.
 *   IMPRIMIR  devuelve `null`. El comprobante YA existe y YA se declaro a la
 *             DGII. Negarse a imprimirlo o a mandarlo por correo no arregla
 *             nada -- solo deja al cliente sin su papel. La plantilla ya omite
 *             la linea cuando esto es null (`inv.ncfExpiryDate` en
 *             documentTemplates), que es lo correcto: mejor sin la linea que
 *             con una fecha inventada.
 *
 * Nacio porque TRES sitios -- el correo, la impresion y el PDF -- tenian su
 * propia copia de esta logica, escrita asi:
 *
 *     sequence?.sequenceExpiry
 *       || (sequence?.expiryDate
 *             ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-')
 *             : null)
 *
 * Tres fallos en una linea, y la linea repetida tres veces:
 *   - `new Date` sobre una columna `date` resta un dia (lo de siempre);
 *   - `toLocaleDateString('es-DO')` no rellena con ceros, asi que el
 *     `.replace` daba "1-9-2026", que ni siquiera es dd-MM-aaaa;
 *   - el texto guardado no se comprobaba contra el calendario.
 */
export function vencimientoSecuenciaSiConsta(seq: Secuencia, ecfType: string): string | null {
  // El tipo manda. Aunque la secuencia tuviera una fecha cargada, en un e-32 o
  // un e-34 el campo no va en el documento: devolverla haria que se enviara.
  if (!exigeVencimientoSecuencia(ecfType)) return null;

  // El texto guardado se comprueba contra el CALENDARIO, no contra una forma.
  // Las dos rutas de secuencias validaban con /^\d{2}-\d{2}-\d{4}$/, que deja
  // pasar '32-13-2026' y '31-02-2026', y este es el valor que sale dentro del
  // e-CF y en el papel.
  const explicita = seq?.sequenceExpiry?.trim();
  if (explicita) return esFechaDgii(explicita) ? explicita : null;

  // `expiry_date` es una columna `date`: drizzle la entrega como la cadena
  // 'AAAA-MM-DD'. Aqui habia un `new Date(...)` con captadores locales, y eso
  // restaba un dia a TODAS las fechas (336 de 336 medidas). Ver fechaDgii.ts.
  return fechaDgii(seq?.expiryDate);
}

export function vencimientoSecuencia(seq: Secuencia, ecfType: string): string | null {
  if (!exigeVencimientoSecuencia(ecfType)) return null;

  const valor = vencimientoSecuenciaSiConsta(seq, ecfType);
  if (valor) return valor;

  // Aqui abajo ya se sabe que falta. Solo queda decir POR QUE, que no es lo
  // mismo segun lo que haya en la fila: una fecha imposible se corrige, una
  // ausente se carga.
  const explicita = seq?.sequenceExpiry?.trim();
  if (explicita) {
    throw new Error(
      `La secuencia e-CF de tipo e-${ecfType} tiene una fecha de vencimiento que no existe: ` +
      `"${explicita}". ` +
      'Corrijala en Ajustes > Secuencias (dd-MM-aaaa) antes de emitir. ' +
      'No se envia el comprobante con una fecha imposible.'
    );
  }

  throw new Error(
    `La secuencia e-CF de tipo e-${ecfType} no tiene fecha de vencimiento configurada, ` +
    'y este tipo de comprobante la exige. ' +
    'Cargue la fecha de su autorizacion de la DGII en Ajustes > Secuencias antes de emitir. ' +
    'No se envia el comprobante con una fecha supuesta.'
  );
}
