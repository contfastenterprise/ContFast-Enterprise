import { db, invoices, dgiiSubmissions, ecfSequences, companySettings, companies } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { decrypt } from '@/utils/encryption';
import nodemailer from 'nodemailer';
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
export async function processDgiiSubmissionJob(data: { companyId: string; invoiceId: string; attemptsMade?: number }): Promise<any> {
  const { companyId, invoiceId } = data;
  const attemptsMade = data.attemptsMade ?? 0;
  console.log(`[JobRunner] Processing DGII submission for invoice ${invoiceId} (attempt ${attemptsMade + 1})...`);

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
    modifiedNcf: (invoice as any).modifiedNcf || undefined,
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
    console.log(`[JobRunner] ✓ DGII submission accepted for invoice ${invoiceId}, trackId: ${result.trackId}`);

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
    console.error(`[JobRunner] ✗ DGII submission failed for invoice ${invoiceId}: ${result.message}`);

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
export async function sendEmailJob(data: { to: string; subject: string; text: string; html?: string; pdfPath?: string }): Promise<any> {
  const { to, subject, text, html, pdfPath } = data;
  console.log(`[JobRunner] Preparing to send email to: ${to} with subject: "${subject}"...`);

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'no-reply@contfast.com';

  if (!host || !user || !pass) {
    console.error('[JobRunner] SMTP configuration is missing. Cannot send email.');
    throw new Error('SMTP configuration missing');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for other ports
    auth: {
      user,
      pass,
    },
  });

  const attachments: any[] = [];
  if (pdfPath) {
    const resolvedPath = path.isAbsolute(pdfPath) 
      ? pdfPath 
      : path.join(process.cwd(), pdfPath);

    if (fs.existsSync(resolvedPath)) {
      attachments.push({
        filename: path.basename(resolvedPath),
        path: resolvedPath,
      });
      console.log(`[JobRunner] Attaching PDF file: ${resolvedPath}`);
    } else {
      console.warn(`[JobRunner] PDF file not found at path: ${resolvedPath}`);
    }
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  });

  console.log(`[JobRunner] Email sent successfully to ${to}.`);
  return { success: true };
}
