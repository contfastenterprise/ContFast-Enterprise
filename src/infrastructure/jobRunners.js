"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDgiiSubmissionJob = processDgiiSubmissionJob;
exports.sendEmailJob = sendEmailJob;
const db_1 = require("@/db");
const drizzle_orm_1 = require("drizzle-orm");
const msellerClient_1 = require("@/services/dgii/msellerClient");
const invoiceRepository_1 = require("@/repositories/invoiceRepository");
const encryption_1 = require("@/utils/encryption");
const nodemailer_1 = require("nodemailer");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Format a Date or date string to DGII dd-MM-yyyy format.
 */
function toDgiiDate(d) {
    const date = typeof d === 'string' ? new Date(d) : d;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}
/**
 * Determines the entorno (environment) string for mSeller based on company setting.
 */
function resolveEntorno(dgiiEnv) {
    if (!dgiiEnv)
        return 'TesteCF';
    if (dgiiEnv === 'production')
        return 'eCF';
    if (dgiiEnv === 'cert')
        return 'CerteCF';
    return 'TesteCF';
}
/**
 * Core business logic for submitting an invoice to the DGII.
 */
async function processDgiiSubmissionJob(data) {
    const { companyId, invoiceId } = data;
    const attemptsMade = data.attemptsMade ?? 0;
    console.log(`[JobRunner] Processing DGII submission for invoice ${invoiceId} (attempt ${attemptsMade + 1})...`);
    // 1. Load invoice with lines
    const invoice = await invoiceRepository_1.InvoiceRepository.getById(invoiceId, companyId);
    if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
    }
    // 2. Load company profile
    const [company] = await db_1.db
        .select()
        .from(db_1.companies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.companies.id, companyId), (0, drizzle_orm_1.isNull)(db_1.companies.deletedAt)))
        .limit(1);
    if (!company) {
        throw new Error(`Company ${companyId} not found`);
    }
    // 3. Load company settings for mSeller credentials
    const [settings] = await db_1.db
        .select()
        .from(db_1.companySettings)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.companySettings.companyId, companyId), (0, drizzle_orm_1.isNull)(db_1.companySettings.deletedAt)))
        .limit(1);
    if (!settings) {
        throw new Error(`Company settings not found for ${companyId}`);
    }
    // 4. Check for mSeller credentials from settings
    const msellerEmail = settings.msellerEmail;
    const msellerPasswordEncrypted = settings.msellerPasswordEncrypted;
    const msellerPassword = msellerPasswordEncrypted ? (0, encryption_1.decrypt)(msellerPasswordEncrypted) : null;
    const msellerApiKeyEncrypted = settings.msellerApiKeyEncrypted;
    if (!msellerEmail || !msellerPassword || !msellerApiKeyEncrypted) {
        throw new Error('mSeller credentials not configured. Please set them in company settings.');
    }
    const entorno = resolveEntorno(settings.dgiiEnv);
    const msellerUrl = settings.msellerUrl || 'https://ecf.api.mseller.app';
    const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;
    // 5. Instantiate MSellerClient
    const client = new msellerClient_1.MSellerClient({
        baseUrl,
        entorno,
        email: msellerEmail,
        password: msellerPassword,
        apiKeyEncrypted: msellerApiKeyEncrypted,
    });
    // 6. Load sequence for sequenceExpiry
    const [seq] = await db_1.db
        .select()
        .from(db_1.ecfSequences)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ecfSequences.companyId, companyId), (0, drizzle_orm_1.eq)(db_1.ecfSequences.ecfType, invoice.ecfType), (0, drizzle_orm_1.eq)(db_1.ecfSequences.status, 'active'), (0, drizzle_orm_1.isNull)(db_1.ecfSequences.deletedAt)))
        .limit(1);
    // Determine sequence expiry in dd-MM-yyyy format
    let sequenceExpiry = '31-12-2026'; // fallback
    if (seq) {
        if (seq.sequenceExpiry) {
            sequenceExpiry = seq.sequenceExpiry;
        }
        else if (seq.expiryDate) {
            sequenceExpiry = toDgiiDate(seq.expiryDate);
        }
    }
    // 7. Build ECF payload
    const subtotal = parseFloat(invoice.subtotal.toString());
    const totalTaxes = parseFloat(invoice.totalTaxes.toString());
    const total = parseFloat(invoice.total.toString());
    const paymentType = invoice.paymentStatus === 'unpaid' ? '2' : '1';
    const ecfPayload = msellerClient_1.MSellerClient.buildECFPayload({
        ncf: invoice.ncf,
        ecfType: invoice.ecfType,
        sequenceExpiry,
        paymentType,
        issueDate: new Date(invoice.createdAt),
        emitterRnc: company.rnc,
        emitterName: company.name,
        emitterAddress: company.businessActivity || 'República Dominicana',
        buyerRnc: invoice.buyerRnc || undefined,
        buyerName: invoice.buyerName || undefined,
        subtotal,
        totalTaxes,
        total,
        modifiedNcf: invoice.modifiedNcf || undefined,
        lines: (invoice.lines || []).map((line, idx) => ({
            index: idx + 1,
            name: line.productId, // fallback; ideally fetch product name
            quantity: parseFloat(line.quantity.toString()),
            unitPrice: parseFloat(line.unitPrice.toString()),
            discount: parseFloat(line.discount.toString()),
            taxRate: 0.18,
        })),
    });
    // 8. Update dgii_submissions status to 'processing'
    await db_1.db
        .update(db_1.dgiiSubmissions)
        .set({ status: 'processing', updatedAt: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.invoiceId, invoiceId), (0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.companyId, companyId)));
    // 9. Send document to mSeller
    const result = await client.sendDocument(ecfPayload);
    if (result.success) {
        console.log(`[JobRunner] ✓ DGII submission accepted for invoice ${invoiceId}, trackId: ${result.trackId}`);
        // Update invoice status to accepted
        await db_1.db
            .update(db_1.invoices)
            .set({
            status: 'accepted',
            msellerTrackId: result.trackId || null,
            dgiiMessage: result.message || 'Aceptado por la DGII',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.invoices.id, invoiceId), (0, drizzle_orm_1.eq)(db_1.invoices.companyId, companyId)));
        // Update dgii_submissions to accepted
        await db_1.db
            .update(db_1.dgiiSubmissions)
            .set({
            status: 'accepted',
            trackId: result.trackId,
            responseMessage: result.message || 'Aceptado',
            responsePayload: JSON.stringify(result.rawResponse),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.invoiceId, invoiceId), (0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.companyId, companyId)));
        return { success: true, trackId: result.trackId };
    }
    else {
        console.error(`[JobRunner] ✗ DGII submission failed for invoice ${invoiceId}: ${result.message}`);
        // Update dgii_submissions to failed
        await db_1.db
            .update(db_1.dgiiSubmissions)
            .set({
            status: 'failed',
            responseMessage: result.message,
            responsePayload: JSON.stringify(result.rawResponse),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.invoiceId, invoiceId), (0, drizzle_orm_1.eq)(db_1.dgiiSubmissions.companyId, companyId)));
        // Update invoice status to rejected/failed
        await db_1.db
            .update(db_1.invoices)
            .set({
            status: 'rejected',
            dgiiMessage: result.message || 'Rechazado por la DGII',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.invoices.id, invoiceId), (0, drizzle_orm_1.eq)(db_1.invoices.companyId, companyId)));
        throw new Error(`mSeller rejected: ${result.message}`);
    }
}
/**
 * Core business logic for sending an email.
 */
async function sendEmailJob(data) {
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
    const transporter = nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465, // true for port 465, false for other ports
        auth: {
            user,
            pass,
        },
    });
    const attachments = [];
    if (pdfPath) {
        const resolvedPath = path_1.default.isAbsolute(pdfPath)
            ? pdfPath
            : path_1.default.join(process.cwd(), pdfPath);
        if (fs_1.default.existsSync(resolvedPath)) {
            attachments.push({
                filename: path_1.default.basename(resolvedPath),
                path: resolvedPath,
            });
            console.log(`[JobRunner] Attaching PDF file: ${resolvedPath}`);
        }
        else {
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
