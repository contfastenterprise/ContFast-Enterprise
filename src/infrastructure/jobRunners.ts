import { db, invoices, dgiiSubmissions, ecfSequences, companySettings, companies } from '@/db';
import { vencimientoSecuencia } from '@/services/dgii/secuencia';
import { eq, and, isNull } from 'drizzle-orm';
import { leerEstado, mensajeEstado, camposDeFirma } from '@/services/dgii/estadoEnvio';
import { leerDesenlace, mensajeDesconocido } from '@/services/dgii/desenlaceEnvio';
import { Logger } from '@/utils/logger';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { envioEnCurso } from '@/repositories/dgiiSubmissionRepository';
import { entornoDgii } from '@/services/dgii/entorno';
import { credencialesMseller } from '@/services/dgii/credenciales';
import fs from 'fs';
import path from 'path';

/**
 * Format a Date or date string to DGII dd-MM-yyyy format.
 */
function toDgiiDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * La resolucion del entorno vivia aqui, en una copia que solo miraba el ajuste
 * de la empresa y no el MODO de la operacion: con la empresa en produccion, un
 * reenvio lanzado en modo PRUEBA salia a la DGII de verdad con un NCF de la
 * secuencia de pruebas. Ahora vive en src/services/dgii/entorno.ts, en un solo
 * sitio y con el modo por delante.
 */

/**
 * Core business logic for submitting an invoice to the DGII.
 */
// Nota de aislamiento: estas actualizaciones de dgii_submissions no filtran
// por `modo` y no hace falta. Se localizan por invoiceId, y una factura vive
// en un solo entorno, asi que todos sus envios comparten el suyo. Anadirlo
// obligaria a meter el modo en el payload de la cola, con los trabajos que ya
// estan encolados apuntando al formato viejo.
export async function processDgiiSubmissionJob(data: { companyId: string; invoiceId: string; submissionId?: string; attemptsMade?: number }): Promise<any> {
  const { companyId, invoiceId } = data;
  const attemptsMade = data.attemptsMade ?? 0;
  Logger.info(`[JobRunner] Processing DGII submission for invoice ${invoiceId} (attempt ${attemptsMade + 1})...`);

  // 1. Load invoice with lines
  //
  // El payload de la cola no lleva el entorno, y anadirselo romperia los
  // trabajos ya encolados. Se deduce de la propia factura: el id es clave
  // primaria, asi que id + empresa la localiza sin ambiguedad. Antes se dejaba
  // el valor por defecto de getById, que era 'PRODUCCION', de modo que una
  // factura emitida en PRUEBA no se encontraba y el trabajo moria diciendo que
  // no existia.
  const [ref] = await db
    .select({ modo: invoices.modo })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!ref) {
    throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
  }
  const modo = ref.modo as 'PRODUCCION' | 'PRUEBA';

  // 1b. QUE intento actualiza este trabajo.
  //
  // Antes no se preguntaba: los tres UPDATE de mas abajo iban por
  // `invoice_id + company_id` y tocaban TODAS las filas de la factura a la
  // vez. Como se inserta una fila por intento, un reenvio que fallaba ponia
  // 'failed' y machacaba `response_payload` tambien en la fila que estaba
  // 'accepted' -- es decir, borraba la constancia de una aceptacion de la
  // DGII, que es de donde salen el codigo de seguridad y el QR del
  // comprobante.
  //
  // Ahora el trabajo trae su `submissionId`. Los que ya estaban encolados no
  // lo llevan, y para esos se deduce el intento vivo mas reciente, que nunca
  // es uno ya aceptado.
  const submissionId = data.submissionId ?? (await envioEnCurso(invoiceId, companyId));
  if (!submissionId) {
    throw new Error(
      `No hay un envio pendiente que actualizar para la factura ${invoiceId}. ` +
      'Puede que ya se haya procesado.'
    );
  }
  const esteEnvio = and(
    eq(dgiiSubmissions.id, submissionId),
    eq(dgiiSubmissions.companyId, companyId)
  );

  const invoice = await InvoiceRepository.getById(invoiceId, companyId, modo);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
  }

  // 2. Load company profile
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  // 3. Load company settings for mSeller credentials
  const [settings] = await db
    .select()
    .from(companySettings)
    .where(and(eq(companySettings.companyId, companyId), isNull(companySettings.deletedAt)))
    .limit(1);

  if (!settings) {
    throw new Error(`Company settings not found for ${companyId}`);
  }

  // 4. El entorno y las credenciales
  //
  // El entorno sale del MODO de la factura, que es el que se acaba de leer unas
  // lineas mas arriba y el mismo con el que se eligio la secuencia. Antes salia
  // solo del ajuste de la empresa: una factura de PRUEBA se reenviaba a la DGII
  // real si la empresa estaba en produccion.
  //
  // Las credenciales se piden PARA ese entorno. La clave de API es distinta en
  // cada ambiente, y `credencialesMseller` falla con un mensaje concreto si
  // falta la de este: el trabajo se reintenta, que es lo que hacia tambien el
  // error anterior.
  const entorno = entornoDgii(modo);
  const credenciales = await credencialesMseller(companyId, entorno);

  const msellerUrl = settings.msellerUrl || 'https://ecf.api.mseller.app';
  const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;

  // 5. Instantiate MSellerClient
  const client = new MSellerClient({
    baseUrl,
    entorno,
    email: credenciales.email,
    password: credenciales.password,
    apiKeyEncrypted: credenciales.apiKeyEncrypted,
  });

  // 6. Load sequence for sequenceExpiry
  const [seq] = await db
    .select()
    .from(ecfSequences)
    .where(
      and(
        eq(ecfSequences.companyId, companyId),
        // Cada entorno tiene su autorizacion SACF; sin esto el envio real
        // podia avanzar la secuencia de pruebas.
        eq(ecfSequences.modo, modo),
        eq(ecfSequences.ecfType, invoice.ecfType),
        eq(ecfSequences.status, 'active'),
        isNull(ecfSequences.deletedAt)
      )
    )
    .limit(1);

  // Era `let sequenceExpiry = '31-12-2026'; // fallback`. La misma logica
  // duplicada aqui y en la emision, y esa duplicacion es la razon de que el
  // valor fijo durara tanto. Vive en un solo sitio y sin valor por defecto.
  const sequenceExpiry = vencimientoSecuencia(seq, invoice.ecfType);

  // La tasa de ITBIS de cada linea. Este era el QUINTO camino del mismo
  // agujero que arreglaron la 0039 y la 0040: aqui habia un `taxRate: 0.18`
  // escrito a pelo, y este es el envio EN DIFERIDO -- el que sale cuando la
  // emision no pudo hablar con mSeller. O sea que una factura al 16% o exenta
  // que se emitiera sin conexion acababa llegando a la DGII al 18%.
  //
  // Si la linea no tiene tasa guardada (factura anterior a la 0039) se deduce
  // del resumen, y SOLO cuando el resumen no deja lugar a dudas: una unica
  // tasa de ITBIS. Si no se puede deducir, el trabajo falla. Es deliberado:
  // un e-CF con el ITBIS equivocado ya presentado a la DGII no se deshace, y
  // un trabajo fallido si se reintenta.
  const tasasDelResumen = Array.from(new Set(
    (invoice.taxes || [])
      .filter((t: any) => (t.taxType || '').toUpperCase().includes('ITBIS'))
      .map((t: any) => Number(t.rate))
      .filter((r: number) => Number.isFinite(r))
  ));
  const tasaDeLinea = (line: any): number => {
    if (line.taxRate != null) return Number(line.taxRate);
    if (tasasDelResumen.length === 1) return tasasDelResumen[0] / 100;
    throw new Error(
      `La factura ${invoice.ncf} no tiene guardada la tasa de ITBIS de sus lineas ` +
      `y su resumen tiene ${tasasDelResumen.length} tasas distintas, asi que no se ` +
      'puede deducir. No se envia a la DGII con una tasa supuesta: corrija la factura ' +
      'y vuelva a enviarla.'
    );
  };

  // 7. Build ECF payload
  const subtotal = parseFloat(invoice.subtotal.toString());
  const totalTaxes = parseFloat(invoice.totalTaxes.toString());
  const total = parseFloat(invoice.total.toString());
  const paymentType = invoice.paymentStatus === 'unpaid' ? '2' : '1';

  const ecfPayload = MSellerClient.buildECFPayload({
    ncf: invoice.ncf,
    ecfType: invoice.ecfType,
    sequenceExpiry,
    paymentType,
    issueDate: new Date(invoice.createdAt),
    emitterRnc: company.rnc,
    emitterName: company.name,
    emitterAddress: company.businessActivity || 'República Dominicana',
    buyerRnc: (invoice as any).buyerRnc || undefined,
    buyerName: (invoice as any).buyerName || undefined,
    subtotal,
    totalTaxes,
    total,
    modifiedNcf: (invoice as any).modifiedNcf || undefined,
    indicadorNotaCredito: (invoice as any).indicadorNotaCredito ?? undefined,
    lines: (invoice.lines || []).map((line: any, idx: number) => ({
      index: idx + 1,
      // Era `name: line.productId`, o sea el uuid del producto viajando como
      // NOMBRE del articulo dentro del e-CF que se le manda a la DGII. El
      // nombre real ya venia en la consulta (`productName`), sin pedir nada
      // mas.
      name: line.productName || line.productId,
      quantity: parseFloat(line.quantity.toString()),
      unitPrice: parseFloat(line.unitPrice.toString()),
      discount: parseFloat(line.discount.toString()),
      taxRate: tasaDeLinea(line),
      taxCategory: line.taxCategory ?? null,
    })),
  });

  // 8. Update dgii_submissions status to 'processing'
  await db
    .update(dgiiSubmissions)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(esteEnvio);

  // 9. Send document to mSeller
  const result = await client.sendDocument(ecfPayload);

  if (result.success) {
    // "accepted" era prematuro: aqui todavia no se sabe. Lo que se sabe es que
    // mSeller respondio.
    Logger.info(`[JobRunner] ✓ DGII submission answered for invoice ${invoiceId}, trackId: ${result.trackId}`);

    // La lectura del estado vive en un solo sitio: `leerEstado`. Antes se
    // interpretaba aqui, y ademas con DOS suposiciones encadenadas -- el
    // `|| 'Aceptado'` cuando no venia estado, y `let newStatus = 'accepted'`
    // como valor inicial, que dejaba aceptado tambien lo no reconocido.
    // `result.success` solo dice que la llamada salio bien, no que la DGII
    // haya aceptado nada.
    const lectura = leerEstado(result.rawResponse);
    const newStatus = lectura.estado;

    // Update invoice status to accepted/submitted/rejected
    await db
      .update(invoices)
      .set({
        status: newStatus as any,
        msellerTrackId: result.trackId || null,
        dgiiMessage: mensajeEstado(lectura, result.message),
        // DB-22: la firma que devuelve mSeller se guarda en la FACTURA, que es
        // donde nada la pisa. `camposDeFirma` solo trae lo que vino, asi que
        // un dato ausente no aparece en el objeto y este `set` NUNCA sustituye
        // un valor bueno por uno vacio.
        ...camposDeFirma(result.rawResponse),
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));

    // Update dgii_submissions to accepted/submitted/rejected
    await db
      .update(dgiiSubmissions)
      .set({
        status: newStatus as any,
        trackId: result.trackId,
        responseMessage: mensajeEstado(lectura, result.message),
        responsePayload: JSON.stringify(result.rawResponse),
        // Se guarda el codigo en su columna (0041) SOLO si vino. `undefined`
        // deja el valor anterior intacto: un reintento que no traiga codigo no
        // puede borrar el que ya constaba.
        securityCode: result.securityCode || undefined,
        updatedAt: new Date(),
      })
      .where(esteEnvio);

    return { success: true, trackId: result.trackId };
  } else {
    // Auditoria P0-06 (2026-09-03): este `else` trataba TODO fallo de
    // `client.sendDocument` -- timeout, corte de red, HTTP no-2xx sin marca
    // de rechazo -- como un rechazo definitivo de la DGII. El camino sincrono
    // (`invoiceSubmissionService.submitToDgii`) ya distinguia esto con
    // `leerDesenlace`, pero este worker (el que procesa "Enviar"/"Reenviar" y
    // el envio diferido) no lo usaba. Consecuencia real: un timeout marcaba
    // la factura como `rejected`, y `POST /api/v1/ecf/[id]/resubmit` deja
    // reenviar cualquier factura `rejected` -- un usuario que ve "rechazada"
    // por un timeout pulsa "reenviar" y el sistema presenta el MISMO NCF por
    // segunda vez a la DGII. Ver services/dgii/desenlaceEnvio.ts.
    const lectura = leerDesenlace(result.message, result.rawResponse);

    if (lectura.desenlace === 'rechazo') {
      Logger.error(`[JobRunner] ✗ DGII rejected invoice ${invoiceId} (${lectura.marca}): ${result.message}`);

      // Update dgii_submissions to failed
      await db
        .update(dgiiSubmissions)
        .set({
          status: 'failed',
          responseMessage: result.message,
          responsePayload: JSON.stringify(result.rawResponse),
          updatedAt: new Date(),
        })
        .where(esteEnvio);

      // Update invoice status to rejected/failed
      await db
        .update(invoices)
        .set({
          status: 'rejected',
          dgiiMessage: result.message || 'Rechazado por la DGII',
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));

      throw new Error(`mSeller rejected: ${result.message}`);
    }

    // Desenlace desconocido. NO se marca 'rejected'/'failed', y NO se relanza
    // el job (no throw -> BullMQ da el job por completado, sin reintento
    // automatico) -- reenviar un documento que la DGII pudo haber aceptado es
    // arriesgarse a duplicar un comprobante fiscal. Queda en 'submitted', que
    // es el mismo estado que consulta `sincronizarPendientes` para resolverlo
    // solo en la siguiente pasada.
    Logger.warn(`[JobRunner] Desenlace desconocido para la factura ${invoiceId}; queda pendiente de consulta`, {
      error: result.message,
    });

    await db
      .update(dgiiSubmissions)
      .set({
        status: 'submitted',
        responseMessage: mensajeDesconocido(result.message || ''),
        responsePayload: JSON.stringify(result.rawResponse),
        updatedAt: new Date(),
      })
      .where(esteEnvio);

    await db
      .update(invoices)
      .set({
        status: 'submitted',
        dgiiMessage: mensajeDesconocido(result.message || ''),
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));

    return { success: false, desenlace: 'desconocido' as const };
  }
}

/**
 * Core business logic for sending an email.
 */
export async function sendEmailJob(data: { 
  to: string; 
  subject: string; 
  text: string; 
  html?: string; 
  pdfPath?: string;
  from?: string;
  fromName?: string;
  companyId?: string;
  referenceId?: string;
  modo?: 'PRODUCCION' | 'PRUEBA';
  [key: string]: any; 
}): Promise<any> {
  const { to, subject, text, html, pdfPath } = data;
  Logger.info(`[JobRunner] Preparing to send email to: ${to} with subject: "${subject}"...`);

  const { getFromEmail } = await import('@/utils/mailer');
  let from = data.from || getFromEmail('ContFast Enterprise');
  if (data.fromName && !from.includes('<')) {
    from = `"${data.fromName}" <${from}>`;
  }

  const attachments: any[] = [];
  if (pdfPath) {
    const resolvedPath = path.isAbsolute(pdfPath) 
      ? pdfPath 
      : path.join(/*turbopackIgnore: true*/ process.cwd(), pdfPath);

    if (fs.existsSync(resolvedPath)) {
      attachments.push({
        filename: path.basename(resolvedPath),
        path: resolvedPath,
      });
      Logger.info(`[JobRunner] Attaching local PDF file: ${resolvedPath}`);
    } else {
      try {
        const { StorageService } = await import('@/services/storageService');
        const { bucketName, filePath } = StorageService.parseDbPath(pdfPath);
        Logger.info(`[JobRunner] Downloading PDF attachment from Supabase Storage: bucket=${bucketName}, path=${filePath}`);
        const fileBuffer = await StorageService.downloadFile(bucketName, filePath);
        
        attachments.push({
          filename: filePath.split('/').pop() || 'factura.pdf',
          content: fileBuffer,
          contentType: 'application/pdf',
        });
        Logger.info(`[JobRunner] Attached PDF from Supabase Storage successfully.`);
      } catch (err: any) {
        Logger.error(`[JobRunner] Failed to download PDF attachment from Supabase Storage: ${pdfPath}`, err);
      }
    }
  }

  let providerMessageId = '';
  let errorMessage = '';
  let status: 'sent' | 'failed' = 'failed';

  try {
    const { getTransporter } = await import('@/utils/mailer');
    const transporter = getTransporter();

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments,
    });

    providerMessageId = info.messageId || '';
    status = 'sent';
    Logger.info(`[JobRunner] Email sent successfully to ${to}.`);
  } catch (error: any) {
    errorMessage = error.message;
    status = 'failed';
    Logger.error(`[JobRunner] Failed to send email to ${to}`, error);
  }

  try {
    const { db } = await import('@/db');
    const { systemEmailLogs } = await import('@/db/schema/system');
    
    // Attempt to extract companyId from data, assuming standard structure or defaulting to something
    const companyId = data.companyId || (data.order && data.order.companyId) || (data.company && data.company.id) || null;
    const referenceId = data.orderId || data.referenceId || null;
    
    if (companyId) {
      await db.insert(systemEmailLogs).values({
        companyId,
        context: data.context || 'background_job',
        referenceId,
        toEmail: to,
        subject,
        status,
        attachmentNames: attachments.map(a => a.filename),
        errorMessage: errorMessage || null,
        providerMessageId: providerMessageId || null,
        sentAt: status === 'sent' ? new Date() : null,
        // Legitimo: El payload de los trabajos ya encolados no lo lleva, y
        // anadirlo como obligatorio romperia los que esten en cola ahora mismo.
        modo: data.modo || 'PRODUCCION'
      });
    } else {
       Logger.warn(`[JobRunner] Could not log email to systemEmailLogs because companyId was missing in job data.`);
    }
  } catch (dbError) {
    Logger.error(`[JobRunner] Failed to log background email to DB`, dbError);
  }

  if (status === 'failed') {
    throw new Error(`Email sending failed: ${errorMessage}`);
  }

  return { success: true };
}
