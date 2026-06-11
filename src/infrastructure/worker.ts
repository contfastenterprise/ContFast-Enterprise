import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { db, invoices, dgiiSubmissions, ecfSequences, companySettings, companies } from '@/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { decrypt } from '@/utils/encryption';

const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '5', 10);

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
 * Process a DGII submission job — loads invoice, builds ECF, sends via mSeller, updates DB.
 */
async function processDgiiSubmission(job: Job): Promise<any> {
  const { companyId, invoiceId } = job.data as { companyId: string; invoiceId: string };
  console.log(`[Worker] Processing DGII submission for invoice ${invoiceId} (attempt ${job.attemptsMade + 1})...`);

  // 1. Load invoice with lines
  const invoice = await InvoiceRepository.getById(invoiceId, companyId);
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
  const msellerPassword = msellerPasswordEncrypted ? decrypt(msellerPasswordEncrypted) : null;
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
    console.log(`[Worker] ✓ DGII submission accepted for invoice ${invoiceId}, trackId: ${result.trackId}`);

    // Update invoice status to accepted
    await db
      .update(invoices)
      .set({
        status: 'accepted',
        msellerTrackId: result.trackId || null,
        dgiiMessage: result.message || 'Aceptado por la DGII',
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));

    // Update dgii_submissions to accepted
    await db
      .update(dgiiSubmissions)
      .set({
        status: 'accepted',
        trackId: result.trackId,
        responseMessage: result.message || 'Aceptado',
        responsePayload: JSON.stringify(result.rawResponse),
        updatedAt: new Date(),
      })
      .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)));

    return { success: true, trackId: result.trackId };
  } else {
    console.error(`[Worker] ✗ DGII submission failed for invoice ${invoiceId}: ${result.message}`);

    // Update dgii_submissions to failed, increment retry count
    await db
      .update(dgiiSubmissions)
      .set({
        status: 'failed',
        responseMessage: result.message,
        responsePayload: JSON.stringify(result.rawResponse),
        retryCount: db.$count(dgiiSubmissions, eq(dgiiSubmissions.invoiceId, invoiceId)) as any,
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

    // Throw error to let BullMQ retry (max 3 attempts with exponential backoff set in queue)
    throw new Error(`mSeller rejected: ${result.message}`);
  }
}

if (redis) {
  console.log('Initializing BullMQ Workers...');

  // 1. DGII Submissions Worker (real implementation)
  const dgiiWorker = new Worker(
    'dgii-submissions',
    processDgiiSubmission,
    { connection: redis as any, concurrency: CONCURRENCY }
  );

  dgiiWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (dgii-submissions) completed successfully.`);
  });

  dgiiWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (dgii-submissions) failed (attempt ${job?.attemptsMade}): ${err.message}`);
    // On final failure (all retries exhausted), mark submission as failed
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      const { companyId, invoiceId } = job.data;
      db.update(dgiiSubmissions)
        .set({ status: 'failed', responseMessage: err.message, updatedAt: new Date() })
        .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)))
        .catch((e: any) => console.error('[Worker] Failed to update dgii_submissions on exhausted retries:', e));
    }
  });

  // 2. Reports Generation Worker
  const reportWorker = new Worker(
    'reports-generation',
    async (job: Job) => {
      const { companyId, reportType, format, params, userId } = job.data;
      console.log(`[Worker] Generating ${format.toUpperCase()} report of type ${reportType} for company ${companyId}...`);

      // Simulating heavy report computation (PDF/Excel generation)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log(`[Worker] Report generation complete.`);
      return { success: true, path: `/reports/${companyId}/${reportType}_${Date.now()}.${format}` };
    },
    { connection: redis as any, concurrency: 1 } // Process one heavy report at a time
  );

  reportWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (reports-generation) completed successfully.`);
  });

  reportWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (reports-generation) failed with error:`, err.message);
  });

  // 3. Email Sending Worker
  const emailWorker = new Worker(
    'emails-sending',
    async (job: Job) => {
      const { to, subject, text, html } = job.data;
      console.log(`[Worker] Sending email to: ${to} with subject: "${subject}"...`);

      // Simulating SMTP send
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log(`[Worker] Email sent to ${to}.`);
      return { success: true };
    },
    { connection: redis as any, concurrency: CONCURRENCY }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (emails-sending) completed successfully.`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (emails-sending) failed with error:`, err.message);
  });
} else {
  console.warn('BullMQ Workers not initialized: Redis is offline or not configured.');
}
