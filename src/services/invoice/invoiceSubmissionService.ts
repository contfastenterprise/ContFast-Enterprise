import { db, ecfSequences, invoices } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { decryptAsync } from '@/utils/encryption';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult, EcfRejectedError, MSellerCommunicationError } from './types';

export class InvoiceSubmissionService {
  /**
   * Submits the generated invoice to MSeller/DGII.
   * If there is a communication error, it either throws MSellerCommunicationError or returns signed status.
   * If it is rejected structurally, it throws EcfRejectedError.
   */
  static async submitToDgii(
    data: IssueInvoiceInput,
    ncf: string,
    company: any,
    settings: any,
    totals: CalculatedTotals,
    activeCashSessionId: string | undefined
  ): Promise<DgiiSubmissionResult> {
    let msellerTrackId: string | null = null;
    let dgiiMessage: string | null = null;
    let securityHash: string = '';
    let qrCode: string | null = null;
    let finalStatus: 'signed' | 'submitted' | 'accepted' | 'rejected' = 'signed';
    let msellerResponsePayload: any = null;

    const msellerEmail = settings?.msellerEmail;
    const msellerPasswordEncrypted = settings?.msellerPasswordEncrypted;
    const msellerPassword = msellerPasswordEncrypted ? await decryptAsync(msellerPasswordEncrypted) : null;
    const msellerApiKeyEncrypted = settings?.msellerApiKeyEncrypted;

    if (msellerEmail && msellerPassword && msellerApiKeyEncrypted) {
      try {
        const resolveEntorno = (env?: string) => {
          if (env === 'production' || env === '1') return 'eCF';
          return 'TesteCF';
        };
        const entorno = resolveEntorno(settings.dgiiEnv);
        const msellerUrl = settings.msellerUrl || 'https://ecf.api.mseller.app';
        const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;

        const msellerClient = new MSellerClient({
          baseUrl,
          entorno,
          email: msellerEmail,
          password: msellerPassword,
          apiKeyEncrypted: msellerApiKeyEncrypted,
        });

        // Load sequence to get sequenceExpiry
        const [seqRecord] = await db
          .select()
          .from(ecfSequences)
          .where(
            and(
              eq(ecfSequences.companyId, data.companyId),
              eq(ecfSequences.ecfType, data.ecfType),
              eq(ecfSequences.status, 'active'),
              isNull(ecfSequences.deletedAt)
            )
          )
          .limit(1);

        let sequenceExpiry = '31-12-2026';
        if (seqRecord) {
          if (seqRecord.sequenceExpiry) {
            sequenceExpiry = seqRecord.sequenceExpiry;
          } else if (seqRecord.expiryDate) {
            const d = new Date(seqRecord.expiryDate);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            sequenceExpiry = `${dd}-${mm}-${yyyy}`;
          }
        }

        let originalInvoiceTotal: number | undefined;
        let originalInvoiceDate: Date | undefined;
        if (data.modifiedInvoiceId) {
          const [originalInvoice] = await db
            .select({ total: invoices.total, createdAt: invoices.createdAt })
            .from(invoices)
            .where(eq(invoices.id, data.modifiedInvoiceId))
            .limit(1);
          if (originalInvoice) {
            originalInvoiceTotal = Number(originalInvoice.total);
            originalInvoiceDate = originalInvoice.createdAt;
          }
        }

        const msellerPayload = MSellerClient.buildECFPayload({
          ncf,
          ecfType: data.ecfType,
          sequenceExpiry,
          paymentType: data.paymentType === 'credit' ? '2' : '1',
          issueDate: new Date(),
          emitterRnc: company.rnc,
          emitterName: company.name,
          emitterAddress: company.businessActivity || 'Santiago, R.D.',
          buyerRnc: data.buyerRnc,
          buyerName: data.buyerName,
          subtotal: totals.subtotal - totals.totalDiscount,
          totalTaxes: totals.totalTaxes,
          total: totals.total,
          modifiedNcf: data.modifiedNcf,
          modifiedNcfDate: originalInvoiceDate,
          originalInvoiceTotal,
          indicadorNotaCredito: data.indicadorNotaCredito,
          lines: totals.itemLines.map((line, idx) => ({
            index: idx + 1,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            taxRate: line.taxRate,
          })),
        });

        // MSeller synchronously sends the document to DGII
        const msellerRes = await msellerClient.sendDocument(msellerPayload);

        if (msellerRes.success) {
          msellerTrackId = msellerRes.trackId || null;
          securityHash = msellerRes.securityCode || '';
          qrCode = msellerRes.qrCode || null;

          const resEstado = (msellerRes.rawResponse?.status || msellerRes.rawResponse?.estado || 'Aceptado').toLowerCase();
          if (resEstado.includes('acept') || resEstado === 'accepted') {
            finalStatus = 'accepted';
          } else if (resEstado.includes('rechaz') || resEstado === 'rejected') {
            finalStatus = 'rejected';
          } else if (resEstado.includes('envi') || resEstado === 'submitted') {
            finalStatus = 'submitted';
          } else {
            finalStatus = 'accepted';
          }

          dgiiMessage = msellerRes.message || 'Aceptado por DGII';
          msellerResponsePayload = msellerRes.rawResponse;
        } else {
          const errMsg = msellerRes.message || '';
          const lowerErrMsg = errMsg.toLowerCase();
          const isCommunicationError =
            lowerErrMsg.includes('auth failed') ||
            lowerErrMsg.includes('fetcherror') ||
            lowerErrMsg.includes('timeout') ||
            lowerErrMsg.includes('timed out') ||
            lowerErrMsg.includes('connection') ||
            lowerErrMsg.includes('typeerror') ||
            lowerErrMsg.includes('aborted') ||
            lowerErrMsg.includes('failed to fetch') ||
            lowerErrMsg.includes('network request failed');

          if (isCommunicationError) {
            if (!data.ignoreCommunicationError) {
              throw new MSellerCommunicationError(errMsg);
            } else {
              Logger.warn('[InvoiceSubmissionService] Bypassing MSeller communication error since ignoreCommunicationError is true', { error: errMsg });
              finalStatus = 'signed';
              dgiiMessage = `Error de red: ${errMsg}. Emitida localmente, pendiente de envío.`;
            }
          } else {
            // DGII Structural Rejection
            throw new EcfRejectedError(errMsg);
          }
        }
      } catch (err: any) {
        if (err instanceof MSellerCommunicationError || err instanceof EcfRejectedError) {
          throw err;
        }

        // Unhandled connection/fetch exception
        if (!data.ignoreCommunicationError) {
          throw new MSellerCommunicationError(err.message);
        } else {
          Logger.warn('[InvoiceSubmissionService] Bypassing fetch network error since ignoreCommunicationError is true', { error: err.message });
          finalStatus = 'signed';
          dgiiMessage = `Error de red: ${err.message}. Emitida localmente, pendiente de envío.`;
        }
      }
    }

    return {
      msellerTrackId,
      dgiiMessage,
      securityHash,
      qrCode,
      finalStatus,
      msellerResponsePayload,
    };
  }
}
