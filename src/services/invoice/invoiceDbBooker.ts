import { db, invoices, chartOfAccounts, auditLogs, ecfSequences, dgiiSubmissions, users, roles, accountsReceivable } from '@/db';
import { FinancialMovementService } from '@/services/financialMovementService';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { CompanyRepository } from '@/repositories/companyRepository';
import { CashRepository } from '@/repositories/cashRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { InvoiceRepository, CreateInvoiceInput } from '@/repositories/invoiceRepository';
import { checkStock, deductStock } from '@/services/inventoryService';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult } from './types';

export class InvoiceDbBooker {
  /**
   * Determines the active cash session.
   */
  static async determineActiveCashSession(
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
   * Predicts the next NCF.
   */
  static async predictNextNcf(companyId: string, ecfType: string) {
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
   * Safely saves a rejected invoice inside an isolated transaction when the DGII rejects it structurally.
   */
  static async saveRejectedInvoice(
    data: IssueInvoiceInput,
    ncf: string,
    activeCashSessionId: string | undefined,
    totals: CalculatedTotals,
    errMsg: string
  ) {
    return await db.transaction(async (tx) => {
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
  }

  /**
   * Executes the atomic SQL database operations inside a single Drizzle transaction.
   */
  static async executeDbTransaction(
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

      // Verify Stock Availability (Skip for Credit Notes since it increases stock)
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

      // Financial movements registration (Clientes)
      if (data.customerId) {
        const isCreditNote = data.ecfType === '34';
        const isDebitNote = data.ecfType === '33';
        const movementType = isCreditNote ? 'credit_note' : isDebitNote ? 'debit_note' : 'invoice';
        const debit = isCreditNote ? 0 : totals.totalNet;
        const credit = isCreditNote ? totals.totalNet : 0;

        await FinancialMovementService.registerMovement(tx, {
          companyId: data.companyId,
          entityType: 'customer',
          customerId: data.customerId,
          date: new Date(),
          movementType,
          documentId: invoice.id,
          documentNumber: ncf,
          originModule: 'invoicing',
          debit,
          credit,
          userId: data.userId,
          notes: isCreditNote
            ? `Nota de Crédito aplicada. Modifica NCF: ${data.modifiedNcf || 'N/A'}`
            : isDebitNote
            ? `Nota de Débito aplicada. Modifica NCF: ${data.modifiedNcf || 'N/A'}`
            : `Factura de Venta emitida. NCF: ${ncf}`,
        });

        // Rule: If cash sale, generate matching immediate payment receipt movement
        const isCash = data.paymentType === 'cash' || data.paymentType === 'bank_transfer';
        if (isCash && !isCreditNote) {
          await FinancialMovementService.registerMovement(tx, {
            companyId: data.companyId,
            entityType: 'customer',
            customerId: data.customerId,
            date: new Date(),
            movementType: 'receipt',
            documentId: invoice.id,
            documentNumber: `REC-CASH-${ncf}`,
            originModule: 'cash',
            debit: 0,
            credit: totals.totalNet,
            userId: data.userId,
            notes: `Cobro inmediato en venta al contado NCF: ${ncf}`,
          });
        }
      }

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

      // Book automatic accounting journal entries (Double Entry)
      const accCxC = await this.getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
      const accCaja = await this.getOrCreateAccount(tx, data.companyId, '1.1.01', 'Efectivo en Caja y Bancos', 'asset');
      const accVentas = await this.getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
      const accItbis = await this.getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');

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
              const accIsr = await this.getOrCreateAccount(tx, data.companyId, '1.1.03', 'Anticipo de Impuestos - Retención ISR', 'asset');
              journalLines.push({ accountId: accIsr.id, debit: 0, credit: ret.retentionAmount });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await this.getOrCreateAccount(tx, data.companyId, '1.1.04', 'Anticipo de Impuestos - Retención ITBIS', 'asset');
              journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: ret.retentionAmount });
            } else {
              const accOtras = await this.getOrCreateAccount(tx, data.companyId, '1.1.05', 'Anticipo de Impuestos - Otras Retenciones', 'asset');
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
              const accIsr = await this.getOrCreateAccount(tx, data.companyId, '1.1.03', 'Anticipo de Impuestos - Retención ISR', 'asset');
              journalLines.push({ accountId: accIsr.id, debit: ret.retentionAmount, credit: 0 });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await this.getOrCreateAccount(tx, data.companyId, '1.1.04', 'Anticipo de Impuestos - Retención ITBIS', 'asset');
              journalLines.push({ accountId: accItbisRet.id, debit: ret.retentionAmount, credit: 0 });
            } else {
              const accOtras = await this.getOrCreateAccount(tx, data.companyId, '1.1.05', 'Anticipo de Impuestos - Otras Retenciones', 'asset');
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

      // Cash Session registration
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

      // Accounts Receivable registration for credit sales
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

      // Record audit log
      await tx.insert(auditLogs).values({
        companyId: data.companyId,
        userId: data.userId,
        action: 'invoice_issued_and_signed',
        entityType: 'invoices',
        entityId: invoice.id,
        newValues: { ncf, total: totals.total, customerId: data.customerId },
        ipAddress: 'server',
      });

      // Register submission or queue asynchronous submission to DGII
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

        await import('@/infrastructure/queue').then(async ({ addJob }) => {
          await addJob('dgii-submissions', 'submit-ecf', {
            companyId: data.companyId,
            invoiceId: invoice.id,
          });
        });
      }

      return {
        invoice,
        msellerResponse: submission.msellerResponsePayload,
      };
    });
  }

  /**
   * Helper to fetch or create an accounting account.
   */
  private static async getOrCreateAccount(
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
}
