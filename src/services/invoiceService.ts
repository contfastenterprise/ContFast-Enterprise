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

    await InvoiceValidator.validatePreEmission(data.companyId, data.ecfType, company.rnc, data.modo);

    // ── 1. Determine the active cash session ──────────────────────────────────
    const activeCashSessionId = await InvoiceDbBooker.determineActiveCashSession(
      data.companyId,
      data.modo,
      data.userId,
      data.paymentType,
      data.cashSessionId
    );

    // ── 2. Calculate totals, taxes and retentions ─────────────────────────────
    const totals = InvoiceCalculator.calculateTotalsAndRetentions(data);

    // ── 3. Pre-flight validations ─────────────────────────────────────────────
    await InvoiceDbBooker.preFlightValidations(data, totals);

    // ── 4. Reservar el NCF ANTES de enviarlo a la DGII ────────────────────────
    //
    // Auditoria DB-04: este paso era `predictNextNcf`, que leia la secuencia sin
    // bloqueo; la reserva real ocurria al final, ya enviado el comprobante. Dos
    // emisiones simultaneas mandaban el mismo NCF a la DGII y una de las dos
    // ventas se perdia. El orden correcto es reservar primero: un hueco en la
    // secuencia se explica, un NCF duplicado ante la DGII no.
    const { ncf } = await InvoiceDbBooker.reservarNcf(data.companyId, data.ecfType, data.modo);

    // Load company settings
    const settings = await CompanyRepository.getSettings(data.companyId);

    // ── 5. Submit to DGII / MSeller ───────────────────────────────────────────
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
    } catch (err: unknown) {
      if (err instanceof EcfRejectedError) {
        // Rechazo estructural: la factura se guarda como `rejected` con el NCF
        // ya reservado, de modo que el numero queda justificado y no hay hueco.
        await InvoiceDbBooker.saveRejectedInvoice(
          data,
          ncf,
          activeCashSessionId,
          totals,
          err.message
        );
      } else {
        // Fallo de comunicacion u otro error: el NCF quedo consumido sin
        // factura. Se deja constancia para poder explicar el hueco.
        await InvoiceDbBooker.registrarNcfSinUsar(
          data.companyId,
          data.modo,
          data.userId,
          ncf,
          data.ecfType,
          `Fallo al enviar a la DGII: ${(err as Error)?.message || 'error desconocido'}`
        );
      }
      throw err;
    }

    // Extract signedXml path from mseller response if available
    let msellerXmlPath = '';
    if (submission.msellerResponsePayload) {
      const raw = submission.msellerResponsePayload;
      msellerXmlPath = raw.signedXml || raw.summarySignedXml || '';
    }

    const xmlPath = '';
    const signedXmlPath = '';
    const pdfPath = `invoices/${data.companyId}/${ncf}.pdf`;

    // ── 6. Perform main transactional operations (Fase 3) ──────────────────────
    //
    // Si esto falla, el comprobante YA esta en la DGII y el NCF ya esta
    // reservado: hay que poder localizar el caso, porque exige conciliacion
    // manual. Se registra y se relanza el error original.
    let dbResult;
    try {
      dbResult = await InvoiceDbBooker.executeDbTransaction(
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
    } catch (err: unknown) {
      await InvoiceDbBooker.registrarNcfSinUsar(
        data.companyId,
        data.modo,
        data.userId,
        ncf,
        data.ecfType,
        `Enviado a la DGII pero no se pudo registrar la factura: ${(err as Error)?.message || 'error desconocido'}`
      );
      throw err;
    }

    // ── 7. File generation outside the transaction block to avoid lockups ──────
    await InvoiceFileGenerator.generateFilesAndSendEmail(
      data,
      ncf,
      company,
      settings,
      totals,
      submission,
      dbResult.invoice.codigoFactura,
      '',
      xmlPath,
      signedXmlPath,
      pdfPath,
      msellerXmlPath
    );

    // ── 8. Post-emission tasks (conduces, quotes) ──────────────────────────────
    await InvoiceFileGenerator.processPostEmission(
      data,
      dbResult.invoice.id,
      settings,
      totals.itemLines
    );

    return dbResult;
  }
}
