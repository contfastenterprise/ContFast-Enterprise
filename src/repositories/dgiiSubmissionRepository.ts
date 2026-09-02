import { db, dgiiSubmissions } from '@/db';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { leerDatosFirma, type DatosFirma } from '@/services/dgii/codigoSeguridad';

/**
 * Envios a la DGII: una fila por INTENTO.
 *
 * POR QUE HACE FALTA ESTE MODULO
 * ------------------------------
 * En `dgii_submissions` hay una fila por cada intento de envio de una factura:
 * la emision inserta una, y `POST /invoices/[id]/submit` y
 * `POST /ecf/[id]/resubmit` insertan otra cada vez que se reintenta. Eso es
 * deliberado -- es el rastro de lo que se le mando a la DGII y lo que
 * contesto -- pero el resto del codigo no estaba escrito para ello:
 *
 *   - CINCO rutas leian con `.limit(1)` y SIN `ORDER BY`. Con dos filas, la
 *     que salia era la que Postgres tuviera mas a mano. De ahi se sacan el
 *     codigo de seguridad y el QR que se imprimen en el comprobante fiscal, o
 *     sea que el documento podia salir sin ellos.
 *
 *   - Los que escriben el resultado actualizaban con
 *     `WHERE invoice_id = ? AND company_id = ?`, sin decir QUE fila. Tocaban
 *     todas a la vez: un reenvio que fallaba ponia `status='failed'` y
 *     machacaba `response_payload` tambien en la fila que estaba `accepted`,
 *     destruyendo la constancia de una aceptacion legitima.
 *
 * Aqui viven las dos consultas que faltaban, para que no vuelva a haber cinco
 * copias distintas de la misma decision.
 */

export type Modo = 'PRODUCCION' | 'PRUEBA';

/** Estados de los que ya no se sale por si solos. */
const FINALES = ['accepted', 'rejected', 'failed'];

/**
 * El envio VIGENTE de una factura: el que representa su situacion ante la
 * DGII y del que salen el codigo de seguridad y el QR del comprobante.
 *
 * El criterio, en orden:
 *   1. Una aceptacion CON respuesta guardada. Es la constancia fiscal, y
 *      manda aunque despues se haya intentado reenviar.
 *   2. Si no la hay, el intento mas reciente.
 *
 * El desempate por `created_at DESC` y por `id` no es adorno: sin un orden
 * total, dos filas creadas en el mismo instante volverian a hacer que el
 * resultado dependa del humor del planificador.
 */
export async function envioVigente(
  invoiceId: string,
  companyId: string,
  modo: Modo,
  tx: any = db
) {
  const [envio] = await tx
    .select()
    .from(dgiiSubmissions)
    .where(
      and(
        eq(dgiiSubmissions.invoiceId, invoiceId),
        eq(dgiiSubmissions.companyId, companyId),
        eq(dgiiSubmissions.modo, modo)
      )
    )
    .orderBy(
      desc(sql`(${dgiiSubmissions.status} = 'accepted' AND ${dgiiSubmissions.responsePayload} IS NOT NULL)`),
      desc(dgiiSubmissions.createdAt),
      desc(dgiiSubmissions.id)
    )
    .limit(1);

  return envio ?? null;
}

/**
 * La fila que un trabajo de la cola debe actualizar: su propio intento.
 *
 * Lo ideal es que el trabajo traiga su `submissionId` en el payload, y desde
 * ahora lo trae. Pero los trabajos YA ENCOLADOS no lo llevan y no se les puede
 * anadir, asi que para esos se deduce: el intento vivo mas reciente de esa
 * factura. Es el mismo criterio que se uso con `modo` en jobRunners.
 *
 * Nunca devuelve una fila ya cerrada en `accepted`: esa es precisamente la que
 * no se puede pisar.
 */
export async function envioEnCurso(
  invoiceId: string,
  companyId: string,
  tx: any = db
): Promise<string | null> {
  const [envio] = await tx
    .select({ id: dgiiSubmissions.id })
    .from(dgiiSubmissions)
    .where(
      and(
        eq(dgiiSubmissions.invoiceId, invoiceId),
        eq(dgiiSubmissions.companyId, companyId),
        inArray(dgiiSubmissions.status, ['pending', 'processing'])
      )
    )
    .orderBy(desc(dgiiSubmissions.createdAt), desc(dgiiSubmissions.id))
    .limit(1);

  return envio?.id ?? null;
}

export const ESTADOS_FINALES = FINALES;

/**
 * Los datos de firma que se IMPRIMEN en el comprobante: codigo de seguridad,
 * QR y fecha de firma.
 *
 * POR QUE ESTA AQUI
 * -----------------
 * Cuatro rutas (GET factura, imprimir, PDF, correo) repetian el mismo bloque de
 * treinta lineas, y las cuatro terminaban igual:
 *
 *     if (!securityCode) {
 *       securityCode = sha256(invoice.id + invoice.ncf).slice(0,16).toUpperCase();
 *     }
 *
 * Se inventaban el codigo de seguridad de un comprobante fiscal. Cuatro copias
 * de la misma decision equivocada, que ademas hay que arreglar cuatro veces.
 * Ahora la decision vive aqui, y es una sola: se lee, o no consta.
 *
 * De donde sale el codigo, en orden:
 *   1. La columna `security_code` del envio (0041). Es la constancia, y no la
 *      pisa la sincronizacion.
 *   2. El `response_payload` guardado, mirando tambien dentro de `dgiiResponse`.
 *   3. Nada. Cadena vacia. El comprobante se imprime diciendo que el codigo no
 *      consta, que es la verdad mientras la DGII no lo devuelva.
 */
export function datosFirmaDeEnvio(envio: {
  securityCode?: string | null;
  responsePayload?: string | null;
} | null): DatosFirma {
  const delPayload = (() => {
    if (!envio?.responsePayload) return { codigo: '', qr: '', fechaFirma: '' };
    try {
      return leerDatosFirma(JSON.parse(envio.responsePayload));
    } catch {
      // Un payload ilegible no es motivo para inventar nada.
      return { codigo: '', qr: '', fechaFirma: '' };
    }
  })();

  return {
    codigo: (envio?.securityCode || '').trim() || delPayload.codigo,
    qr: delPayload.qr,
    fechaFirma: delPayload.fechaFirma,
  };
}

/**
 * La firma del comprobante, con la FACTURA por delante y el envio de respaldo.
 *
 * Hallazgo DB-23. `datosFirmaDeEnvio` resuelve bien de donde sacar el dato
 * dentro de un envio, pero mira solo al envio, y ahi el dato es fragil: el
 * `response_payload` lo reescribe cualquier consulta de estado. Por eso las
 * migraciones 0042 y 0043 llevaron la firma a `invoices`, donde nada la pisa.
 *
 * El orden es el que importa:
 *   1. Las columnas de la factura. Es la constancia.
 *   2. El envio, para los comprobantes anteriores a la 0042 y para los que
 *      acaban de emitirse (la emision escribe la firma en el envio antes de
 *      que ninguna sincronizacion la copie a la factura).
 *   3. Nada. Cadena vacia. No se fabrica: un comprobante sin firma es un
 *      comprobante PENDIENTE, y asi se imprime.
 *
 * Un valor vacio en la factura NUNCA gana sobre uno bueno del envio, y al reves
 * tampoco: cada campo se resuelve por separado, porque mSeller puede traer el
 * codigo sin la fecha o al reves.
 */
export function firmaDelComprobante(
  factura: {
    securityCode?: string | null;
    signatureDate?: string | null;
    qrUrl?: string | null;
  } | null,
  envio: {
    securityCode?: string | null;
    responsePayload?: string | null;
  } | null
): DatosFirma {
  const delEnvio = datosFirmaDeEnvio(envio);

  return {
    codigo: (factura?.securityCode || '').trim() || delEnvio.codigo,
    qr: (factura?.qrUrl || '').trim() || delEnvio.qr,
    fechaFirma: (factura?.signatureDate || '').trim() || delEnvio.fechaFirma,
  };
}
