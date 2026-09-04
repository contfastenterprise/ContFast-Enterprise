import { db, ecfSequences, invoices } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { entornoDgii } from '@/services/dgii/entorno';
import { credencialesMseller } from '@/services/dgii/credenciales';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { vencimientoSecuencia } from '@/services/dgii/secuencia';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult, EcfRejectedError, MSellerCommunicationError } from './types';
import { leerEstado, mensajeEstado } from '@/services/dgii/estadoEnvio';
import { leerDesenlace, mensajeDesconocido } from '@/services/dgii/desenlaceEnvio';
import type { CompanyRepository } from '@/repositories/companyRepository';

export class InvoiceSubmissionService {
  /**
   * Submits the generated invoice to MSeller/DGII.
   * If there is a communication error, it either throws MSellerCommunicationError or returns signed status.
   * If it is rejected structurally, it throws EcfRejectedError.
   */
  static async submitToDgii(
    data: IssueInvoiceInput,
    ncf: string,
    company: NonNullable<Awaited<ReturnType<typeof CompanyRepository.getProfile>>>,
    settings: Awaited<ReturnType<typeof CompanyRepository.getSettings>>,
    totals: CalculatedTotals,
    activeCashSessionId: string | undefined
  ): Promise<DgiiSubmissionResult> {
    let msellerTrackId: string | null = null;
    let dgiiMessage: string | null = null;
    let securityHash: string = '';
    let qrCode: string | null = null;
    let finalStatus: 'signed' | 'submitted' | 'accepted' | 'rejected' = 'signed';
    let msellerResponsePayload: any = null;

    // El entorno depende del MODO de la emision. La copia local que habia aqui
    // era la unica de las cuatro que lo miraba, pero perdia el caso de
    // certificacion: `cert` acababa en pruebas sin avisar.
    const entorno = entornoDgii(data.modo);

    // Las credenciales son de la empresa Y del ambiente. Si faltan, la factura
    // se emite LOCALMENTE y queda pendiente de envio -- exactamente lo que
    // ocurria antes cuando la empresa no las tenia configuradas. Lo que ya no
    // ocurre es enviarla con las credenciales de otra empresa.
    const credenciales = await credencialesMseller(data.companyId, entorno).catch((err: unknown) => {
      Logger.warn(
        '[InvoiceSubmissionService] Sin credenciales de mSeller para este ambiente; se emite localmente',
        { entorno, error: (err as Error)?.message }
      );
      return null;
    });

    if (credenciales) {
      try {
        const msellerUrl = settings?.msellerUrl || 'https://ecf.api.mseller.app';
        const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;

        const msellerClient = new MSellerClient({
          baseUrl,
          entorno,
          email: credenciales.email,
          password: credenciales.password,
          apiKeyEncrypted: credenciales.apiKeyEncrypted,
        });

        // Load sequence to get sequenceExpiry
        const [seqRecord] = await db
          .select()
          .from(ecfSequences)
          .where(
            and(
              eq(ecfSequences.companyId, data.companyId),
              eq(ecfSequences.ecfType, data.ecfType),
              eq(ecfSequences.modo, data.modo),
              eq(ecfSequences.status, 'active'),
              isNull(ecfSequences.deletedAt)
            )
          )
          .limit(1);

        // Era `let sequenceExpiry = '31-12-2026'`: si la secuencia no traia
        // fecha, se declaraba esa a la DGII. Dato fiscal fabricado. Ahora se
        // lee o se para. Ver src/services/dgii/secuencia.ts.
        const sequenceExpiry = vencimientoSecuencia(seqRecord, data.ecfType);

        let originalInvoiceTotal: number | undefined;
        let originalInvoiceDate: Date | undefined;
        if (data.modifiedInvoiceId) {
          const [originalInvoice] = await db
            .select({ total: invoices.total, createdAt: invoices.createdAt })
            .from(invoices)
            .where(
              and(
                eq(invoices.id, data.modifiedInvoiceId),
                // modifiedInvoiceId llega del cuerpo de la peticion. Sin el
                // filtro por empresa se leian el total y la fecha de la factura
                // de otra empresa, y esos dos datos viajan DENTRO del e-CF que
                // se envia a la DGII a nombre propio.
                eq(invoices.companyId, data.companyId),
                eq(invoices.modo, data.modo)
              )
            )
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
            taxCategory: line.taxCategory ?? null,
          })),
        });

        // MSeller synchronously sends the document to DGII
        const msellerRes = await msellerClient.sendDocument(msellerPayload);

        if (msellerRes.success) {
          msellerTrackId = msellerRes.trackId || null;
          securityHash = msellerRes.securityCode || '';
          qrCode = msellerRes.qrCode || null;

          // La lectura vive en `leerEstado`, no aqui. Este bloque tenia DOS
          // caminos hacia 'accepted' que no lo justificaban: el `|| 'Aceptado'`
          // cuando la respuesta no traia estado, y el `else` final, que
          // convertia en aceptado cualquier estado que no se reconociera.
          // `msellerRes.success` dice que la llamada fue bien, no que la DGII
          // haya aceptado el comprobante.
          const lectura = leerEstado(msellerRes.rawResponse);
          finalStatus = lectura.estado;
          dgiiMessage = mensajeEstado(lectura, msellerRes.message);
          msellerResponsePayload = msellerRes.rawResponse;
        } else {
          // EL RECHAZO SE AFIRMA, NO SE SUPONE.
          //
          // Esto preguntaba "?es un error de red?" contra una lista de siete
          // cadenas, y si no coincidia ninguna concluia que la DGII habia
          // rechazado. La lista no puede estar completa: `read ECONNRESET` la
          // esquivo -- "econnreset" no contiene "connection" -- y un corte de
          // conexion se guardo como rechazo estructural de la DGII.
          //
          // Ahora se busca la MARCA del rechazo. Sin marca, el desenlace es
          // desconocido, y un documento que salio con desenlace desconocido es
          // `submitted`: pudo llegar, y `sincronizarPendientes` lo resuelve.
          const errMsg = msellerRes.message || '';
          const lectura = leerDesenlace(errMsg, msellerRes.rawResponse);

          if (lectura.desenlace === 'rechazo') {
            throw new EcfRejectedError(errMsg);
          }

          // Desenlace desconocido. NO se reenvia -- reenviar un documento que la
          // DGII pudo aceptar es arriesgarse a duplicar un comprobante fiscal.
          Logger.warn('[InvoiceSubmissionService] desenlace desconocido; queda pendiente de consulta', {
            ncf, error: errMsg,
          });
          finalStatus = 'submitted';
          dgiiMessage = mensajeDesconocido(errMsg);
          msellerResponsePayload = msellerRes.rawResponse ?? null;
        }
      } catch (err: unknown) {
        if (err instanceof MSellerCommunicationError || err instanceof EcfRejectedError) {
          throw err;
        }

        // Excepcion sin respuesta: la conexion se rompio en algun punto. Mismo
        // criterio que arriba -- puede que el documento saliera, asi que no se
        // afirma ni un rechazo ni un fallo de emision. Queda pendiente de
        // consulta, y NO se reenvia.
        Logger.warn('[InvoiceSubmissionService] excepcion de red; desenlace desconocido', {
          ncf, error: (err as Error)?.message,
        });
        finalStatus = 'submitted';
        dgiiMessage = mensajeDesconocido((err as Error)?.message ?? '');
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
