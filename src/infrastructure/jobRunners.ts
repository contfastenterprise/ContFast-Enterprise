import { db, invoices, dgiiSubmissions, ecfSequences, companySettings, companies } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { decryptAsync } from '@/utils/encryption';
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
 * Determines the entorno (environment) string for mSeller based on company setting.
 */
function resolveEntorno(dgiiEnv: string | null): string {
  if (!dgiiEnv) return 'TesteCF';
  if (dgiiEnv === 'production') return 'eCF';
  if (dgiiEnv === 'cert') return 'CerteCF';
  return 'TesteCF';
}

/**
 * Core business logic for submitting an invoice to the DGII.
 */
// Nota de aislamiento: estas actualizaciones de dgii_submissions no filtran
// por `modo` y no hace falta. Se localizan por invoiceId, y una factura vive
// en un solo entorno, asi que todos sus envios comparten el suyo. Anadirlo
// obligaria a meter el modo en el payload de la cola, con los trabajos que ya
// estan encolados apuntando al formato viejo.
export async function processDgiiSubmissionJob(data: { companyId: string; invoiceId: string; attemptsMade?: number }): Promise<any> {
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

  // 4. Check for mSeller credentials from settings
  const msellerEmail = settings.msellerEmail;
  const msellerPasswordEncrypted = settings.msellerPasswordEncrypted;
  const msellerPassword = msellerPasswordEncrypted ? await decryptAsync(msellerPasswordEncrypted) : null;
  const msellerApiKeyEncrypted = settings.msellerApiKeyEncrypted;

  if (!msellerEmail || !msellerPassword || !msellerApiKeyEncrypted) {
    throw new Error(
      'mSeller credentials not configured. Please set them in company settings.'
    );
  }

  const entorno = resolveEntorno(settings.dgiiEnv);
  const msellerUrl = settings.msellerUrl || 'https://ecf.api.mseller.app';
  const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;

  // 5. Instantiate MSellerClient
  const client = new MSellerClient({
    baseUrl,
    entorno,
    email: msellerEmail,
    password: msellerPassword,
    apiKeyEncrypted: msellerApiKeyEncrypted,
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

  // Determine sequence expiry in dd-MM-yyyy format
  let sequenceExpiry = '31-12-2026'; // fallback
  if (seq) {
    if (seq.sequenceExpiry) {
      sequenceExpiry = seq.sequenceExpiry;
    } else if (seq.expiryDate) {
      sequenceExpiry = toDgiiDate(seq.expiryDate as any);
    }
  }

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
      name: line.productId, // fallback; ideally fetch product name
      quantity: parseFloat(line.quantity.toString()),
      unitPrice: parseFloat(line.unitPrice.toString()),
      discount: parseFloat(line.discount.toString()),
      taxRate: 0.18,
    })),
  });

  // 8. Update dgii_submissions status to 'processing'
  await db
    .update(dgiiSubmissions)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)));

  // 9. Send document to mSeller
  const result = await client.sendDocument(ecfPayload);

  if (result.success) {
    Logger.info(`[JobRunner] ✓ DGII submission accepted for invoice ${invoiceId}, trackId: ${result.trackId}`);

    const resEstado = (result.rawResponse?.status || result.rawResponse?.estado || 'Aceptado').toLowerCase();
    let newStatus = 'accepted';
    if (resEstado.includes('acept') || resEstado === 'accepted') {
      newStatus = 'accepted';
    } else if (resEstado.includes('rechaz') || resEstado === 'rejected') {
      newStatus = 'rejected';
    } else if (resEstado.includes('envi') || resEstado === 'submitted') {
      newStatus = 'submitted';
    }

    // Update invoice status to accepted/submitted/rejected
    await db
      .update(invoices)
      .set({
        status: newStatus as any,
        msellerTrackId: result.trackId || null,
        dgiiMessage: result.message || 'Aceptado por la DGII',
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));

    // Update dgii_submissions to accepted/submitted/rejected
    await db
      .update(dgiiSubmissions)
      .set({
        status: newStatus as any,
        trackId: result.trackId,
        responseMessage: result.message || 'Aceptado',
        responsePayload: JSON.stringify(result.rawResponse),
        updatedAt: new Date(),
      })
      .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)));

    return { success: true, trackId: result.trackId };
  } else {
    Logger.error(`[JobRunner] ✗ DGII submission failed for invoice ${invoiceId}: ${result.message}`);

    // Update dgii_submissions to failed
    await db
      .update(dgiiSubmissions)
      .set({
        status: 'failed',
        responseMessage: result.message,
        responsePayload: JSON.stringify(result.rawResponse),
        updatedAt: new Date(),
      })
      .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)));

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
