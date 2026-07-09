import path from 'path';
import { CompanyRepository } from '@/repositories/companyRepository';
import { IssueInvoiceInput, DgiiSubmissionResult, EcfRejectedError } from './invoice/types';
import { InvoiceValidator } from './invoice/invoiceValidator';
import { InvoiceDbBooker } from './invoice/invoiceDbBooker';
import { InvoiceCalculator } from './invoice/invoiceCalculator';
import { InvoiceSubmissionService } from './invoice/invoiceSubmissionService';
import { InvoiceFileGenerator } from './invoice/invoiceFileGenerator';

export type { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult } from './invoice/types';

export class InvoiceService {
  /**
   * Main service function to issue and sign a new electronic e-CF invoice.
   * Fully refactored and modularized, delegating responsibilities to sub-services.
   */
  static async issueInvoice(data: IssueInvoiceInput) {
    // ── 0. Pre-emission validations (before any DB transaction) ───────────────
    const company = await CompanyRepository.getProfile(data.companyId);
    if (!company) {
      throw new Error('Compañía no encontrada.');
    }

    await InvoiceValidator.validatePreEmission(data.companyId, data.ecfType, company.rnc);

    // ── 1. Determine the active cash session ──────────────────────────────────
    const activeCashSessionId = await InvoiceDbBooker.determineActiveCashSession(
      data.companyId,
      data.userId,
      data.paymentType,
      data.cashSessionId
    );

    // ── 2. Calculate totals, taxes and retentions ─────────────────────────────
    const totals = InvoiceCalculator.calculateTotalsAndRetentions(data);

    // ── 3. Predict next NCF without incrementing database sequence yet ────────
    const { ncf } = await InvoiceDbBooker.predictNextNcf(data.companyId, data.ecfType);

    // Load company settings
    const settings = await CompanyRepository.getSettings(data.companyId);

    // ── 4. Submit to DGII / MSeller ───────────────────────────────────────────
    let submission: DgiiSubmissionResult;
    try {
      submission = await InvoiceSubmissionService.submitToDgii(
        data,
        ncf,
        company,
        settings,
        totals,
        activeCashSessionId
      );
    } catch (err: any) {
      if (err instanceof EcfRejectedError) {
        // Save the invoice in the DB as rejected so the sequence is recorded
        await InvoiceDbBooker.saveRejectedInvoice(
          data,
          ncf,
          activeCashSessionId,
          totals,
          err.message
        );
      }
      throw err;
    }

    // Paths for file storage
    const storageDir = process.env.STORAGE_PATH || './storage';
    const invoicesDir = path.join(storageDir, 'invoices', data.companyId);
    const xmlPath = path.join(invoicesDir, `${ncf}.xml`);
    const signedXmlPath = path.join(invoicesDir, `${ncf}_signed.xml`);
    const msellerXmlPath = path.join(invoicesDir, `${ncf}_mseller.xml`);
    const pdfPath = path.join(invoicesDir, `${ncf}.pdf`);

    // ── 5. Perform main transactional operations (Fase 3) ──────────────────────
    const dbResult = await InvoiceDbBooker.executeDbTransaction(
      data,
      ncf,
      activeCashSessionId,
      totals,
      submission,
      xmlPath,
      signedXmlPath,
      pdfPath,
      msellerXmlPath
    );

    // ── 6. File generation outside the transaction block to avoid lockups ──────
    await InvoiceFileGenerator.generateFilesAndSendEmail(
      data,
      ncf,
      company,
      settings,
      totals,
      submission,
      dbResult.invoice.codigoFactura,
      invoicesDir,
      xmlPath,
      signedXmlPath,
      pdfPath,
      msellerXmlPath
    );

    // ── 7. Post-emission tasks (conduces, quotes) ──────────────────────────────
    await InvoiceFileGenerator.processPostEmission(
      data,
      dbResult.invoice.id,
      settings,
      totals.itemLines
    );

    return dbResult;
  }
}
