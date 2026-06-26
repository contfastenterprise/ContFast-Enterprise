import { db, invoices, chartOfAccounts, auditLogs, ecfSequences, dgiiSubmissions, users, roles, products, accountsReceivable } from '@/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { InvoiceRepository, CreateInvoiceInput } from '@/repositories/invoiceRepository';
import { CompanyRepository } from '@/repositories/companyRepository';
import { DeliveryRepository } from '@/repositories/deliveryRepository';
import { CashRepository } from '@/repositories/cashRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { CustomerRepository } from '@/repositories/customerRepository';
import { decrypt } from '@/utils/encryption';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { addJob } from '@/infrastructure/queue';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { EcfValidator } from '@/services/ecfValidator';
import { checkStock, deductStock } from '@/services/inventoryService';
import { roundMoney } from '@/utils/calculos';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface IssueInvoiceInput {
  companyId: string;
  warehouseId: string;
  customerId?: string;
  userId: string;
  cashSessionId?: string;
  ecfType: string; // '31' (Fiscal), '32' (Consumo), etc.
  paymentType: 'cash' | 'credit' | 'bank_transfer';
  bankName?: string;
  transactionNumber?: string;
  buyerRnc?: string;
  buyerName?: string;
  notes?: string;
  ignoreCommunicationError?: boolean;
  modifiedNcf?: string;
  modifiedInvoiceId?: string;
  indicadorNotaCredito?: number;
  quoteId?: string;
  lines: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number; // e.g. 0.18 for 18% ITBIS
  }[];
  retentions?: {
    retentionId?: string;
    retentionName: string;
    retentionType: 'ITBIS' | 'ISR' | 'OTRA';
    retentionPercentage: number;
    agentRnc?: string;
    retentionDate?: string;
  }[];
}

interface CalculatedTotals {
  subtotal: number;
  totalDiscount: number;
  totalTaxes: number;
  total: number;
  totalRetained: number;
  totalNet: number;
  itemLines: any[];
  taxesList: any[];
  calculatedRetentions: any[];
}

interface DgiiSubmissionResult {
  msellerTrackId: string | null;
  dgiiMessage: string | null;
  securityHash: string;
  qrCode: string | null;
  finalStatus: 'signed' | 'submitted' | 'accepted' | 'rejected';
  msellerResponsePayload: any;
}

export class InvoiceService {
  /**
   * Main service function to issue and sign a new electronic e-CF invoice.
   */
  static async issueInvoice(data: IssueInvoiceInput) {
    // ── 0. Pre-emission validations (before any DB transaction) ───────────────
    const company = await CompanyRepository.getProfile(data.companyId);
    if (!company) {
      throw new Error('Compañía no encontrada.');
    }

    await this.validatePreEmission(data.companyId, data.ecfType, company.rnc);

    // ── 1. Determine the active cash session ──────────────────────────────────
    const activeCashSessionId = await this.determineActiveCashSession(
      data.companyId,
      data.userId,
      data.paymentType,
      data.cashSessionId
    );

    // ── 2. Calculate totals, taxes and retentions ─────────────────────────────
    const totals = this.calculateTotalsAndRetentions(data);

    // ── 3. Predict next NCF without incrementing database sequence yet ────────
    const { ncf } = await this.predictNextNcf(data.companyId, data.ecfType);

    // Load company settings
    const settings = await CompanyRepository.getSettings(data.companyId);

    // ── 4. Submit to DGII / MSeller ───────────────────────────────────────────
    const submission = await this.submitToDgii(data, ncf, company, settings, totals, activeCashSessionId);

    // Paths for file storage
    const storageDir = process.env.STORAGE_PATH || './storage';
    const invoicesDir = path.join(storageDir, 'invoices', data.companyId);
    const xmlPath = path.join(invoicesDir, `${ncf}.xml`);
    const signedXmlPath = path.join(invoicesDir, `${ncf}_signed.xml`);
    const pdfPath = path.join(invoicesDir, `${ncf}.pdf`);

    // ── 5. Perform main transactional operations (Fase 3) ──────────────────────
    const dbResult = await this.executeDbTransaction(
      data,
      ncf,
      activeCashSessionId,
      totals,
      submission,
      xmlPath,
      signedXmlPath,
      pdfPath
    );

    // ── 6. File generation outside the transaction block to avoid lockups ──────
    await this.generateFilesAndSendEmail(
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
      pdfPath
    );

    // ── 7. Post-emission tasks (conduces, quotes) ──────────────────────────────
    await this.processPostEmission(data, dbResult.invoice.id, settings, totals.itemLines);

    return dbResult;
  }

  /**
   * Helper to run pre-emission validation via EcfValidator.
   */
  private static async validatePreEmission(companyId: string, ecfType: string, rnc: string) {
    const preCheck = await EcfValidator.runAll(companyId, ecfType, rnc);
    if (!preCheck.valid) {
      const messages = preCheck.errors.map((e) => e.message).join(' | ');
      const err: any = new Error(`No se puede emitir el e-CF: ${messages}`);
      err.status = 422;
      err.code = 'ECF_PRE_EMISSION_FAILED';
      err.validationErrors = preCheck.errors;
      throw err;
    }
  }

  /**
   * Helper to determine active cash session.
   */
  private static async determineActiveCashSession(
    companyId: string,
    userId: string,
    paymentType: string,
    providedCashSessionId?: string
  ): Promise<string | undefined> {
    let activeCashSessionId = providedCashSessionId;

    if (paymentType === 'cash') {
      const [userWithRole] = await db
        .select({
          roleName: roles.name,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, userId))
        .limit(1);

      const roleName = userWithRole?.roleName?.toLowerCase() || '';
      const isAdminOrSys = roleName.includes('admin') || roleName.includes('sistema');

      let activeSession = null;
      if (isAdminOrSys) {
        activeSession = await CashRepository.getActiveSession(userId, companyId);
        if (!activeSession) {
          activeSession = await CashRepository.getAnyActiveSession(companyId);
        }
      } else {
        activeSession = await CashRepository.getActiveSession(userId, companyId);
      }

      if (!activeSession) {
        throw new Error('Debe abrir una sesión de caja antes de realizar una venta en efectivo.');
      }
      activeCashSessionId = activeSession.id;
    }

    return activeCashSessionId;
  }

  /**
   * Helper to calculate subtotals, discounts, taxes and retentions.
   */
  private static calculateTotalsAndRetentions(data: IssueInvoiceInput): CalculatedTotals {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxes = 0;
    const itemLines: any[] = [];
    const taxSummaryMap: Record<string, { rate: number; amount: number }> = {};

    data.lines.forEach((line) => {
      const lineSubtotal = roundMoney(line.quantity * line.unitPrice);
      const lineDiscount = roundMoney(line.quantity * line.discount);
      const lineTaxableAmount = roundMoney(lineSubtotal - lineDiscount);
      const lineTaxAmount = roundMoney(lineTaxableAmount * line.taxRate);
      const lineTotal = roundMoney(lineTaxableAmount + lineTaxAmount);

      subtotal = roundMoney(subtotal + lineSubtotal);
      totalDiscount = roundMoney(totalDiscount + lineDiscount);
      totalTaxes = roundMoney(totalTaxes + lineTaxAmount);

      itemLines.push({
        productId: line.productId,
        name: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        subtotal: lineSubtotal,
        total: lineTotal,
        taxRate: line.taxRate, // Fixed and preserved for payload construction
      });

      const taxKey = `ITBIS_${(line.taxRate * 100).toFixed(0)}%`;
      if (!taxSummaryMap[taxKey]) {
        taxSummaryMap[taxKey] = { rate: line.taxRate * 100, amount: 0 };
      }
      taxSummaryMap[taxKey].amount = roundMoney(taxSummaryMap[taxKey].amount + lineTaxAmount);
    });

    const total = roundMoney(subtotal - totalDiscount + totalTaxes);
    const taxesList = Object.entries(taxSummaryMap).map(([name, val]) => ({
      taxType: 'ITBIS',
      rate: val.rate,
      amount: val.amount,
    }));

    let totalRetained = 0;
    const calculatedRetentions: any[] = [];

    if (data.retentions && data.retentions.length > 0) {
      data.retentions.forEach((ret) => {
        let amount = 0;
        const baseTaxable = roundMoney(subtotal - totalDiscount);

        if (ret.retentionType === 'ISR') {
          amount = roundMoney(baseTaxable * (ret.retentionPercentage / 100));
        } else if (ret.retentionType === 'ITBIS') {
          amount = roundMoney(totalTaxes * (ret.retentionPercentage / 100));
        } else {
          amount = roundMoney(baseTaxable * (ret.retentionPercentage / 100));
        }

        totalRetained = roundMoney(totalRetained + amount);
        calculatedRetentions.push({
          retentionId: ret.retentionId,
          retentionName: ret.retentionName,
          retentionType: ret.retentionType,
          retentionPercentage: ret.retentionPercentage,
          retentionAmount: amount,
          agentRnc: ret.agentRnc,
          retentionDate: ret.retentionDate,
        });
      });
    }

    const totalNet = roundMoney(total - totalRetained);

    return {
      subtotal,
      totalDiscount,
      totalTaxes,
      total,
      totalRetained,
      totalNet,
      itemLines,
      taxesList,
      calculatedRetentions,
    };
  }

  /**
   * Helper to predict next NCF.
   */
  private static async predictNextNcf(companyId: string, ecfType: string) {
    const seqRecord = await CompanyRepository.getSequence(companyId, ecfType);
    if (!seqRecord) {
      throw new Error(`No existe una secuencia e-CF activa y autorizada para el tipo ${ecfType}.`);
    }
    if (seqRecord.currentSequence >= seqRecord.maxSequence) {
      throw new Error(
        `La secuencia de comprobantes e-CF tipo ${ecfType} ha llegado a su límite máximo (${seqRecord.maxSequence}). Solicite una nueva autorización SACF.`
      );
    }

    const nextVal = seqRecord.currentSequence + 1;
    const isElectronic = seqRecord.prefix.toUpperCase().startsWith('E');
    const padLength = isElectronic ? 10 : 8;
    const sequenceStr = nextVal.toString().padStart(padLength, '0');
    const ncf = `${seqRecord.prefix}${ecfType}${sequenceStr}`;

    return { ncf, seqRecord };
  }

  /**
   * Helper to submit document to MSeller/DGII.
   */
  private static async submitToDgii(
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
    const msellerPassword = msellerPasswordEncrypted ? decrypt(msellerPasswordEncrypted) : null;
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
              const err: any = new Error(`Error de comunicación con la DGII a través de MSeller: ${errMsg}`);
              err.status = 409;
              err.code = 'MSELLER_COMMUNICATION_ERROR';
              throw err;
            } else {
              Logger.warn('[InvoiceService] Bypassing MSeller communication error since ignoreCommunicationError is true', { error: errMsg });
              finalStatus = 'signed';
              dgiiMessage = `Error de red: ${errMsg}. Emitida localmente, pendiente de envío.`;
            }
          } else {
            // DGII Structural Rejection
            const err: any = new Error(`Rechazo de DGII/MSeller: ${errMsg}`);
            err.status = 422;
            err.code = 'ECF_REJECTED';

            // Phase 3 structural rejection fallback: Save the invoice in the DB as rejected so the sequence is recorded
            await db.transaction(async (tx) => {
              const allocatedNcf = await CompanyRepository.allocateNextNcf(tx, data.companyId, data.ecfType);
              if (allocatedNcf !== ncf) {
                throw new Error(`Conflicto de concurrencia NCF al rechazar: se esperaba ${ncf} pero se reservó ${allocatedNcf}.`);
              }

              // Generate internal document number (codigoFactura) in format: PREFIX-YYYY-XXXXXX (e.g. NC-2026-000001)
              const year = new Date().getFullYear();
              const docPrefix = data.ecfType === '34' ? 'NC' : data.ecfType === '33' ? 'ND' : 'FAC';
              const [countResult] = await tx
                .select({ count: sql<number>`count(*)` })
                .from(invoices)
                .where(
                  and(
                    eq(invoices.companyId, data.companyId),
                    sql`codigo_factura LIKE ${docPrefix + '-' + year + '-%'}`
                  )
                );
              const nextNum = Number(countResult?.count || 0) + 1;
              const codigoFactura = `${docPrefix}-${year}-${nextNum.toString().padStart(6, '0')}`;

              await InvoiceRepository.create({
                companyId: data.companyId,
                warehouseId: data.warehouseId,
                customerId: data.customerId,
                userId: data.userId,
                cashSessionId: activeCashSessionId,
                ncf,
                ecfType: data.ecfType,
                status: 'rejected',
                paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
                paymentType: data.paymentType,
                bankName: data.bankName,
                transactionNumber: data.transactionNumber,
                subtotal: totals.subtotal,
                discount: totals.totalDiscount,
                totalTaxes: totals.totalTaxes,
                total: totals.total,
                totalRetained: totals.totalRetained,
                totalNet: totals.totalNet,
                dgiiMessage: errMsg,
                buyerRnc: data.buyerRnc,
                buyerName: data.buyerName,
                notes: data.notes,
                modifiedNcf: data.modifiedNcf,
                modifiedInvoiceId: data.modifiedInvoiceId,
                codigoFactura,
                deliveryStatus: 'pending',
                quoteId: data.quoteId || undefined,
                lines: totals.itemLines,
                taxes: totals.taxesList,
                retentions: totals.calculatedRetentions,
              }, tx);
            });
            throw err;
          }
        }
      } catch (err: any) {
        if (err.code === 'MSELLER_COMMUNICATION_ERROR' || err.code === 'ECF_REJECTED') {
          throw err;
        }

        // Unhandled connection/fetch exception
        if (!data.ignoreCommunicationError) {
          const mSellerErr: any = new Error(`Error de conexión con la DGII a través de MSeller: ${err.message}`);
          mSellerErr.status = 409;
          mSellerErr.code = 'MSELLER_COMMUNICATION_ERROR';
          throw mSellerErr;
        } else {
          Logger.warn('[InvoiceService] Bypassing fetch network error since ignoreCommunicationError is true', { error: err.message });
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

  /**
   * Helper to run the SQL transactions atomically.
   */
  private static async executeDbTransaction(
    data: IssueInvoiceInput,
    ncf: string,
    activeCashSessionId: string | undefined,
    totals: CalculatedTotals,
    submission: DgiiSubmissionResult,
    xmlPath: string,
    signedXmlPath: string,
    pdfPath: string
  ) {
    return await db.transaction(async (tx) => {
      // Allocate and increment NCF inside the transaction to lock and commit it
      const allocatedNcf = await CompanyRepository.allocateNextNcf(tx, data.companyId, data.ecfType);
      if (allocatedNcf !== ncf) {
        throw new Error(`Conflicto de concurrencia NCF: se esperaba ${ncf} pero se reservó ${allocatedNcf}. Por favor intente de nuevo.`);
      }

      // Generate internal document number (codigoFactura) in format: PREFIX-YYYY-XXXXXX (e.g. NC-2026-000001)
      const year = new Date().getFullYear();
      const docPrefix = data.ecfType === '34' ? 'NC' : data.ecfType === '33' ? 'ND' : 'FAC';
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, data.companyId),
            sql`codigo_factura LIKE ${docPrefix + '-' + year + '-%'}`
          )
        );
      const nextNum = Number(countResult?.count || 0) + 1;
      const codigoFactura = `${docPrefix}-${year}-${nextNum.toString().padStart(6, '0')}`;

      // 2.0. Verify Stock Availability (Skip for Credit Notes since it increases stock)
      if (data.ecfType !== '34') {
        for (const line of totals.itemLines) {
          const hasStock = await checkStock(line.productId, data.warehouseId, line.quantity, tx, true);
          if (!hasStock) {
            throw new Error(`Inventario insuficiente para el producto: ${line.name}`);
          }
        }
      }

      // Create invoice in database
      const invoiceInput: CreateInvoiceInput = {
        companyId: data.companyId,
        warehouseId: data.warehouseId,
        customerId: data.customerId,
        userId: data.userId,
        cashSessionId: activeCashSessionId,
        ncf,
        ecfType: data.ecfType,
        status: submission.finalStatus,
        paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
        paymentType: data.paymentType,
        bankName: data.bankName,
        transactionNumber: data.transactionNumber,
        subtotal: totals.subtotal,
        discount: totals.totalDiscount,
        totalTaxes: totals.totalTaxes,
        total: totals.total,
        totalRetained: totals.totalRetained,
        totalNet: totals.totalNet,
        xmlPath,
        signedXmlPath,
        pdfPath,
        msellerTrackId: submission.msellerTrackId || undefined,
        dgiiMessage: submission.dgiiMessage || undefined,
        buyerRnc: data.buyerRnc,
        buyerName: data.buyerName,
        notes: data.notes,
        modifiedNcf: data.modifiedNcf,
        modifiedInvoiceId: data.modifiedInvoiceId,
        indicadorNotaCredito: data.indicadorNotaCredito,
        codigoFactura,
        lines: totals.itemLines,
        taxes: totals.taxesList,
        retentions: totals.calculatedRetentions,
      };

      const invoice = await InvoiceRepository.create(invoiceInput, tx);

      // Deduct or add inventory (Deducción diferida a Conduce de Entrega. Solo Nota de Crédito e-34 agrega stock aquí)
      if (data.ecfType === '34') {
        for (const line of totals.itemLines) {
          await deductStock(
            data.companyId,
            line.productId,
            data.warehouseId,
            -line.quantity,
            data.userId,
            'return',
            invoice.id,
            `Devolución Nota de Crédito ${ncf}`,
            tx
          );
        }
      }

      // 2.9. Book automatic accounting journal entries (Double Entry)
      const accCxC = await getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
      const accCaja = await getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
      const accVentas = await getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
      const accItbis = await getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');

      const isCashOrBank = data.paymentType === 'cash' || data.paymentType === 'bank_transfer';
      const paymentAccount = isCashOrBank ? accCaja : accCxC;

      let journalLines = [];
      if (data.ecfType === '34') {
        // Credit note reverses standard journal entry
        const creditAmount = totals.totalNet;
        journalLines = [
          { accountId: accVentas.id, debit: totals.subtotal - totals.totalDiscount, credit: 0 },
          { accountId: paymentAccount.id, debit: 0, credit: creditAmount },
        ];
        if (totals.totalTaxes > 0) {
          journalLines.unshift({ accountId: accItbis.id, debit: totals.totalTaxes, credit: 0 });
        }

        // Revert retentions if any
        if (totals.totalRetained > 0) {
          for (const ret of totals.calculatedRetentions) {
            if (ret.retentionType === 'ISR') {
              const accIsr = await getOrCreateAccount(tx, data.companyId, '1.1.03', 'Anticipo de Impuestos - Retención ISR', 'asset');
              journalLines.push({ accountId: accIsr.id, debit: 0, credit: ret.retentionAmount });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await getOrCreateAccount(tx, data.companyId, '1.1.04', 'Anticipo de Impuestos - Retención ITBIS', 'asset');
              journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: ret.retentionAmount });
            } else {
              const accOtras = await getOrCreateAccount(tx, data.companyId, '1.1.05', 'Anticipo de Impuestos - Otras Retenciones', 'asset');
              journalLines.push({ accountId: accOtras.id, debit: 0, credit: ret.retentionAmount });
            }
          }
        }
      } else {
        journalLines = [
          { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
          { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
        ];
        if (totals.totalTaxes > 0) {
          journalLines.push({ accountId: accItbis.id, debit: 0, credit: totals.totalTaxes });
        }

        // Book retention assets (Anticipo de impuestos)
        if (totals.totalRetained > 0) {
          for (const ret of totals.calculatedRetentions) {
            if (ret.retentionType === 'ISR') {
              const accIsr = await getOrCreateAccount(tx, data.companyId, '1.1.03', 'Anticipo de Impuestos - Retención ISR', 'asset');
              journalLines.push({ accountId: accIsr.id, debit: ret.retentionAmount, credit: 0 });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await getOrCreateAccount(tx, data.companyId, '1.1.04', 'Anticipo de Impuestos - Retención ITBIS', 'asset');
              journalLines.push({ accountId: accItbisRet.id, debit: ret.retentionAmount, credit: 0 });
            } else {
              const accOtras = await getOrCreateAccount(tx, data.companyId, '1.1.05', 'Anticipo de Impuestos - Otras Retenciones', 'asset');
              journalLines.push({ accountId: accOtras.id, debit: ret.retentionAmount, credit: 0 });
            }
          }
        }
      }

      await AccountRepository.createJournalEntry(tx, {
        companyId: data.companyId,
        reference: invoice.id,
        date: new Date(),
        description: `Facturación Automática e-CF NCF: ${ncf}`,
        lines: journalLines,
      });

      // 2.10. Cash Session registration
      if (activeCashSessionId) {
        const isCreditNote = data.ecfType === '34';
        await CashRepository.addMovement(tx, {
          companyId: data.companyId,
          cashSessionId: activeCashSessionId,
          invoiceId: invoice.id,
          type: isCreditNote ? 'refund' : 'sale',
          amount: totals.totalNet,
          description: isCreditNote
            ? `Devolución Nota de Crédito: ${ncf}`
            : data.ecfType === '33'
            ? `Nota de Débito e-CF Comprobante: ${ncf}`
            : `Venta e-CF Comprobante: ${ncf}`,
          reference: ncf,
        });
      }

      // 2.11. Accounts Receivable registration for credit sales
      if (data.paymentType === 'credit' && data.customerId) {
        if (data.ecfType === '34' && data.modifiedInvoiceId) {
          // A credit note on a credit sale reduces the existing receivable balance!
          const [existingAr] = await tx
            .select()
            .from(accountsReceivable)
            .where(eq(accountsReceivable.invoiceId, data.modifiedInvoiceId))
            .limit(1);
          if (existingAr) {
            const newBalance = Math.max(0, parseFloat(existingAr.balance || '0') - totals.totalNet);
            await tx
              .update(accountsReceivable)
              .set({
                balance: newBalance.toString(),
                status: newBalance <= 0.01 ? 'paid' : 'pending',
                updatedAt: new Date(),
              })
              .where(eq(accountsReceivable.id, existingAr.id));
          }
        } else {
          // Standard invoice or Debit Note (increases receivable)
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30); // 30 days credit default
          await AccountRepository.createAccountsReceivable(tx, {
            companyId: data.companyId,
            customerId: data.customerId,
            invoiceId: invoice.id,
            amount: totals.totalNet,
            dueDate,
          });
        }
      }

      // 2.12. Record audit log
      await tx.insert(auditLogs).values({
        companyId: data.companyId,
        userId: data.userId,
        action: 'invoice_issued_and_signed',
        entityType: 'invoices',
        entityId: invoice.id,
        newValues: { ncf, total: totals.total, customerId: data.customerId },
        ipAddress: 'server',
      });

      // 3. Register submission or queue asynchronous submission to DGII
      if (submission.finalStatus === 'accepted') {
        await tx.insert(dgiiSubmissions).values({
          companyId: data.companyId,
          invoiceId: invoice.id,
          status: 'accepted',
          trackId: submission.msellerTrackId,
          responseMessage: submission.dgiiMessage,
          responsePayload: JSON.stringify(submission.msellerResponsePayload),
          retryCount: 0,
        });
      } else if (submission.finalStatus === 'signed') {
        await tx.insert(dgiiSubmissions).values({
          companyId: data.companyId,
          invoiceId: invoice.id,
          status: 'pending',
          retryCount: 0,
        });

        await addJob('dgii-submissions', 'submit-ecf', {
          companyId: data.companyId,
          invoiceId: invoice.id,
        });
      }

      return {
        invoice,
        msellerResponse: submission.msellerResponsePayload,
      };
    });
  }

  /**
   * Helper to write files and send the invoice to the customer asynchronously.
   */
  private static async generateFilesAndSendEmail(
    data: IssueInvoiceInput,
    ncf: string,
    company: any,
    settings: any,
    totals: CalculatedTotals,
    submission: DgiiSubmissionResult,
    codigoFactura: string,
    invoicesDir: string,
    xmlPath: string,
    signedXmlPath: string,
    pdfPath: string
  ) {
    try {
      const rawXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Generado asíncronamente</ECF>';
      const signedXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Firmado asíncronamente</ECF>';

      let securityHash = submission.securityHash;
      if (!securityHash) {
        securityHash = crypto.createHash('sha256').update(signedXml).digest('hex').substring(0, 16).toUpperCase();
      }

      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }
      fs.writeFileSync(xmlPath, rawXml);
      fs.writeFileSync(signedXmlPath, signedXml);

      // Fetch real product SKUs and units of measure
      const productIds = totals.itemLines.map((l) => l.productId).filter(Boolean);
      let dbProducts: any[] = [];
      if (productIds.length > 0) {
        dbProducts = await db
          .select({
            id: products.id,
            sku: products.sku,
            unitOfMeasure: products.unitOfMeasure,
          })
          .from(products)
          .where(sql`${products.id} in (${sql.raw(productIds.map((id) => `'${id}'`).join(','))})`);
      }
      const productMap = new Map(dbProducts.map((p) => [p.id, p]));

      // Generate PDF Buffer using premium HTML/Puppeteer rendering engine
      const formattedInvoiceRecord = {
        ncf,
        ecfType: data.ecfType,
        paymentType: data.paymentType,
        createdAt: new Date().toISOString(),
        paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
        subtotal: totals.subtotal,
        discount: totals.totalDiscount,
        totalTaxes: totals.totalTaxes,
        total: totals.total,
        notes: data.notes || '',
        codigoFactura,
        securityCode: securityHash,
        signatureDate: new Date().toISOString(),
        lines: totals.itemLines.map((l) => {
          const prod = productMap.get(l.productId);
          return {
            quantity: l.quantity,
            productName: l.name,
            productSku: prod?.sku || 'N/A',
            unitOfMeasure: prod?.unitOfMeasure || 'Unidad',
            unitPrice: l.unitPrice,
            discount: l.discount,
            total: l.total,
          };
        }),
        taxes: totals.taxesList.map((t) => ({
          taxType: t.taxType,
          rate: t.rate,
          amount: t.amount,
        })),
        company: {
          name: company.name,
          rnc: company.rnc,
          address: company.address || 'Santiago, R.D.',
          phone: '1-829-214-4128',
          email: settings?.msellerEmail || 'latindoors@gmail.com',
          logoUrl: settings?.logoUrl || undefined,
          settings: {
            printLayout: settings?.printLayout || 'carta',
          },
        },
        customer: {
          name: data.buyerName || 'Consumidor Final',
          rncCedula: data.buyerRnc || '',
          phone: '',
          address: '',
        },
      };

      // Generate QR Code base64
      let qrBase64 = '';
      if (submission.qrCode) {
        if (submission.qrCode.startsWith('http')) {
          qrBase64 = await PdfGenerator.generateQrBase64(submission.qrCode);
        } else {
          qrBase64 = submission.qrCode;
        }
      } else {
        const dateFormatted = new Date().toLocaleDateString('es-DO').replace(/\//g, '-');
        const dgiiUrl = `https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=${company.rnc}&rncComprador=${data.buyerRnc || ''}&eNCF=${ncf}&fechaFirma=${dateFormatted}&montoTotal=${Number(totals.total).toFixed(2)}&codigoSeguridad=${securityHash}`;
        qrBase64 = await PdfGenerator.generateQrBase64(dgiiUrl);
      }

      const layout = (settings?.printLayout as 'carta' | '80mm' | '58mm') || 'carta';
      const html = DocumentTemplates.renderInvoice(formattedInvoiceRecord, layout, qrBase64);
      const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // Send invoice email if customer has a registered email
      if (data.customerId) {
        try {
          const customer = await CustomerRepository.findById(data.customerId, data.companyId);
          if (customer && customer.email) {
            let docName = 'Factura';
            let typeStr = data.paymentType === 'credit' ? ' a crédito' : '';
            if (data.ecfType === '33') {
              docName = 'Nota de Débito';
              typeStr = '';
            } else if (data.ecfType === '34') {
              docName = 'Nota de Crédito';
              typeStr = '';
            }

            const subject = `${docName}${typeStr} - NCF: ${ncf}`;
            const companyName = company.name || 'ContFast';

            await addJob('emails-sending', 'send-email', {
              to: customer.email,
              subject,
              text: `Estimado(a) ${customer.name},\n\nLe notificamos la emisión de su ${docName.toLowerCase()}${typeStr} NCF: ${ncf} por un valor total de RD$ ${totals.total}.\n\nAtentamente,\n${companyName}`,
              html: `<p>Estimado(a) <strong>${customer.name}</strong>,</p><p>Le notificamos la emisión de su ${docName.toLowerCase()}${typeStr} NCF: <strong>${ncf}</strong> por un valor total de <strong>RD$ ${totals.total}</strong>.</p><p>Atentamente,<br/>${companyName}</p>`,
              pdfPath,
            });
            Logger.info(`[InvoiceService] Invoice email queued for customer ${customer.email} regarding NCF ${ncf} with attachment ${pdfPath}`);
          }
        } catch (emailErr) {
          Logger.error('[InvoiceService] Error queuing email for invoice', emailErr);
        }
      }
    } catch (pdfErr: any) {
      Logger.error('[InvoiceService] Error generating PDF or XML outside transaction', pdfErr);
    }
  }

  /**
   * Helper to perform follow up operations (delivery note, quote status).
   */
  private static async processPostEmission(
    data: IssueInvoiceInput,
    invoiceId: string,
    settings: any,
    itemLines: any[]
  ) {
    // Automatically issue delivery note if autoDeliveryNotes is enabled
    if (settings?.autoDeliveryNotes && ['31', '32', '45'].includes(data.ecfType)) {
      try {
        const draftNote = await DeliveryRepository.create({
          companyId: data.companyId,
          invoiceId: invoiceId,
          userId: data.userId,
          deliveryDate: new Date(),
          driverName: 'Despacho Automático',
          dispatcherName: 'Sistema',
          notes: 'Conduce generado automáticamente al emitir la factura.',
          lines: itemLines.map((line: any) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
          })),
        });

        await DeliveryRepository.approve(draftNote.id, data.userId, data.companyId);
      } catch (autoErr) {
        Logger.error('[InvoiceService] Error creating automatic delivery note', autoErr);
      }
    }

    if (data.quoteId) {
      try {
        const { QuoteService } = await import('@/services/quoteService');
        await QuoteService.markAsInvoiced(data.quoteId);
      } catch (err) {
        Logger.error('[InvoiceService] Error marking quote as invoiced', err);
      }
    }
  }
}

// Helpers outside class

async function getOrCreateAccount(
  tx: any,
  companyId: string,
  code: string,
  name: string,
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
) {
  const [acc] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));

  if (acc) return acc;

  const [newAcc] = await tx
    .insert(chartOfAccounts)
    .values({
      companyId,
      code,
      name,
      type,
      status: 'active',
    })
    .returning();

  return newAcc;
}

function generateEcfXml(
  company: any,
  ncf: string,
  data: IssueInvoiceInput,
  subtotal: number,
  discount: number,
  taxes: number,
  total: number,
  lines: any[],
  taxesList: any[]
): string {
  const dateStr = new Date().toISOString().substring(0, 10);
  const itemsXml = lines
    .map(
      (line, idx) => `
    <DetalleItem>
      <NumeroLinea>${idx + 1}</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>${line.name}</NombreItem>
      <CantidadItem>${line.quantity.toFixed(4)}</CantidadItem>
      <PrecioUnitarioItem>${line.unitPrice.toFixed(2)}</PrecioUnitarioItem>
      <DescuentoMonto>${line.discount.toFixed(2)}</DescuentoMonto>
      <MontoItem>${line.total.toFixed(2)}</MontoItem>
    </DetalleItem>`
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<ECF xmlns="http://jrd.gov.do/dgii/ecf">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${data.ecfType}</TipoeCF>
      <eNCF>${ncf}</eNCF>
      <FechaEmision>${dateStr}</FechaEmision>
      <TipoPago>${data.paymentType === 'cash' ? '1' : '2'}</TipoPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${company.rnc}</RNCEmisor>
      <RazonSocialEmisor>${company.name}</RazonSocialEmisor>
    </Emisor>
    <Comprador>
      <RNCComprador>${data.customerId ? '123456789' : '222222222'}</RNCComprador>
      <RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoSubtotal>${subtotal.toFixed(2)}</MontoSubtotal>
      <MontoDescuento>${discount.toFixed(2)}</MontoDescuento>
      <MontoImpuesto>${taxes.toFixed(2)}</MontoImpuesto>
      <MontoTotal>${total.toFixed(2)}</MontoTotal>
    </Totales>
  </Encabezado>
  <Detalles>
    ${itemsXml}
  </Detalles>
</ECF>`.trim();
}
