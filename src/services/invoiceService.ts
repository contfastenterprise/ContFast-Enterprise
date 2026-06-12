import { db, invoices, chartOfAccounts, auditLogs, ecfSequences, dgiiSubmissions } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { InvoiceRepository, CreateInvoiceInput } from '@/repositories/invoiceRepository';
import { CompanyRepository } from '@/repositories/companyRepository';
import { CashRepository } from '@/repositories/cashRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { CustomerRepository } from '@/repositories/customerRepository';
import { decrypt, decryptToBuffer } from '@/utils/encryption';
import { generateInvoicePdf, PDFInvoiceData } from '@/utils/pdfGenerator';
import { addJob } from '@/infrastructure/queue';
import { MSellerClient, MSellerInvoicePayload } from '@/services/dgii/msellerClient';
import { EcfValidator } from '@/services/ecfValidator';
import { checkStock, deductStock } from '@/services/inventoryService';
import fs from 'fs';
import path from 'path';

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
  lines: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number; // e.g. 0.18 for 18% ITBIS
  }[];
}

export class InvoiceService {
  /**
   * Main service function to issue and sign a new electronic e-CF invoice.
   */
  static async issueInvoice(data: IssueInvoiceInput) {
    // ── 0. Pre-emission validations (before any DB transaction) ───────────────
    // Fetch company profile to get the RNC needed for the DGII status check.
    const company = await CompanyRepository.getProfile(data.companyId);
    if (!company) {
      throw new Error('Compañía no encontrada.');
    }

    const preCheck = await EcfValidator.runAll(
      data.companyId,
      data.ecfType,
      company.rnc
    );

    if (!preCheck.valid) {
      const messages = preCheck.errors.map((e) => e.message).join(' | ');
      const err: any = new Error(`No se puede emitir el e-CF: ${messages}`);
      err.status = 422;
      err.code = 'ECF_PRE_EMISSION_FAILED';
      err.validationErrors = preCheck.errors;
      throw err;
    }

    // ── 1. Determine the active cash session ──────────────────────────────────
    let activeCashSessionId = data.cashSessionId;

    if (data.paymentType === 'cash') {
      const activeSession = await CashRepository.getActiveSession(data.userId, data.companyId);
      if (!activeSession) {
        throw new Error('Debe abrir una sesión de caja antes de realizar una venta en efectivo.');
      }
      activeCashSessionId = activeSession.id;
    }

    // 1. Calculate totals
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxes = 0;
    const itemLines: any[] = [];
    const taxSummaryMap: Record<string, { rate: number; amount: number }> = {};

    data.lines.forEach((line) => {
      const lineSubtotal = line.quantity * line.unitPrice;
      const lineDiscount = line.quantity * line.discount;
      const lineTaxableAmount = lineSubtotal - lineDiscount;
      const lineTaxAmount = lineTaxableAmount * line.taxRate;
      const lineTotal = lineTaxableAmount + lineTaxAmount;

      subtotal += lineSubtotal;
      totalDiscount += lineDiscount;
      totalTaxes += lineTaxAmount;

      itemLines.push({
        productId: line.productId,
        name: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        subtotal: lineSubtotal,
        total: lineTotal,
      });

      // Group taxes by rate
      const taxKey = `ITBIS_${(line.taxRate * 100).toFixed(0)}%`;
      if (!taxSummaryMap[taxKey]) {
        taxSummaryMap[taxKey] = { rate: line.taxRate * 100, amount: 0 };
      }
      taxSummaryMap[taxKey].amount += lineTaxAmount;
    });

    const total = subtotal - totalDiscount + totalTaxes;
    const taxesList = Object.entries(taxSummaryMap).map(([name, val]) => ({
      taxType: 'ITBIS',
      rate: val.rate,
      amount: val.amount,
    }));

    // 2. Perform transactional operations
    return await db.transaction(async (tx) => {
      // 2.0. Verify Stock Availability
      for (const line of itemLines) {
        const hasStock = await checkStock(line.productId, data.warehouseId, line.quantity, tx);
        if (!hasStock) {
          throw new Error(`Inventario insuficiente para el producto: ${line.name}`);
        }
      }

      // 2.1. Allocate NCF (locks sequence row)
      const ncf = await CompanyRepository.allocateNextNcf(tx, data.companyId, data.ecfType);

      // 2.2. Company profile was already fetched above; reuse it.
      const settings = await CompanyRepository.getSettings(data.companyId);

      // 2.3. No synchronous mSeller API call here to maintain scalability and low latency.
      // We rely on the worker to send the payload asynchronously.
      const msellerTrackId = null;
      const dgiiMessage = null;

      const rawXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Generado asíncronamente</ECF>';
      const signedXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Firmado asíncronamente</ECF>';

      // 2.5. Generate security hash for PDF
      const securityHash = crypto.createHash('sha256').update(signedXml).digest('hex').substring(0, 16).toUpperCase();

      // 2.6. Generate PDF Buffer
      const pdfData: PDFInvoiceData = {
        companyName: company.name,
        companyRnc: company.rnc,
        companyAddress: company.businessActivity ?? undefined, // placeholder
        companyPhone: '809-555-0199', // placeholder
        companyLogoUrl: settings.logoUrl ?? undefined,
        ncf,
        ecfType: data.ecfType,
        buyerName: data.buyerName || 'CONSUMIDOR FINAL',
        buyerRnc: data.buyerRnc || undefined,
        invoiceDate: new Date(),
        items: itemLines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          total: l.total,
        })),
        subtotal,
        discount: totalDiscount,
        taxes: taxesList.map((t) => ({ name: `ITBIS (${t.rate}%)`, amount: t.amount })),
        total,
        securityCode: securityHash,
      };

      const pdfBuffer = await generateInvoicePdf(pdfData, settings.printLayout as any);

      // 2.7. Save XML and PDF to local storage (in production, upload to Supabase Storage)
      const storageDir = process.env.STORAGE_PATH || './storage';
      const invoicesDir = path.join(storageDir, 'invoices', data.companyId);
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      const xmlPath = path.join(invoicesDir, `${ncf}.xml`);
      const signedXmlPath = path.join(invoicesDir, `${ncf}_signed.xml`);
      const pdfPath = path.join(invoicesDir, `${ncf}.pdf`);

      fs.writeFileSync(xmlPath, rawXml);
      fs.writeFileSync(signedXmlPath, signedXml);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // 2.8. Create invoice in database
      const invoiceInput: CreateInvoiceInput = {
        companyId: data.companyId,
        warehouseId: data.warehouseId,
        customerId: data.customerId,
        userId: data.userId,
        cashSessionId: activeCashSessionId,
        ncf,
        ecfType: data.ecfType,
        status: 'signed',
        paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
        paymentType: data.paymentType,
        bankName: data.bankName,
        transactionNumber: data.transactionNumber,
        subtotal,
        discount: totalDiscount,
        totalTaxes,
        total,
        xmlPath,
        signedXmlPath,
        pdfPath,
        msellerTrackId: msellerTrackId || undefined,
        dgiiMessage: dgiiMessage || undefined,
        buyerRnc: data.buyerRnc,
        buyerName: data.buyerName,
        lines: itemLines,
        taxes: taxesList,
      };

      const invoice = await InvoiceRepository.create(invoiceInput, tx);

      // 2.8.1 Deduct inventory
      for (const line of itemLines) {
        await deductStock(
          data.companyId,
          line.productId,
          data.warehouseId,
          line.quantity,
          data.userId,
          'sale',
          invoice.id,
          `Venta Factura ${ncf}`,
          tx
        );
      }

      // 2.9. Book automatic accounting journal entries (Double Entry)
      const accCxC = await getOrCreateAccount(tx, data.companyId, '1.1.02', 'Cuentas por Cobrar Clientes', 'asset');
      const accVentas = await getOrCreateAccount(tx, data.companyId, '4.1.01', 'Ingresos por Ventas', 'revenue');
      const accItbis = await getOrCreateAccount(tx, data.companyId, '2.1.03', 'ITBIS por Pagar', 'liability');

      const journalLines = [
        { accountId: accCxC.id, debit: total, credit: 0 },
        { accountId: accVentas.id, debit: 0, credit: subtotal - totalDiscount },
      ];

      if (totalTaxes > 0) {
        journalLines.push({ accountId: accItbis.id, debit: 0, credit: totalTaxes });
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
        await CashRepository.addMovement(tx, {
          companyId: data.companyId,
          cashSessionId: activeCashSessionId,
          invoiceId: invoice.id,
          type: 'sale',
          amount: total,
          description: `Venta e-CF Comprobante: ${ncf}`,
          reference: ncf,
        });
      }

      // 2.11. Accounts Receivable registration for credit sales
      if (data.paymentType === 'credit' && data.customerId) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days credit default
        await AccountRepository.createAccountsReceivable(tx, {
          companyId: data.companyId,
          customerId: data.customerId,
          invoiceId: invoice.id,
          amount: total,
          dueDate,
        });
      }

      // 2.12. Record audit log
      await tx.insert(auditLogs).values({
        companyId: data.companyId,
        userId: data.userId,
        action: 'invoice_issued_and_signed',
        entityType: 'invoices',
        entityId: invoice.id,
        newValues: { ncf, total, customerId: data.customerId },
        ipAddress: 'server',
      });

      // 3. Queue asynchronous submission to DGII using BullMQ
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

      // 4. Send credit invoice email if customer has a registered email
      if (data.paymentType === 'credit' && data.customerId) {
        try {
          const customer = await CustomerRepository.findById(data.customerId, data.companyId);
          if (customer && customer.email) {
            await addJob('emails-sending', 'send-email', {
              to: customer.email,
              subject: `Factura a Crédito - NCF: ${invoice.ncf}`,
              text: `Estimado(a) ${customer.name},\n\nLe notificamos la emisión de su factura a crédito NCF: ${invoice.ncf} por un valor total de RD$ ${invoice.total}.\n\nAtentamente,\nContFast`,
              html: `<p>Estimado(a) <strong>${customer.name}</strong>,</p><p>Le notificamos la emisión de su factura a crédito NCF: <strong>${invoice.ncf}</strong> por un valor total de <strong>RD$ ${invoice.total}</strong>.</p><p>Atentamente,<br/>ContFast</p>`,
            });
            console.log(`[InvoiceService] Credit invoice email queued for customer ${customer.email} regarding NCF ${invoice.ncf}`);
          }
        } catch (emailErr) {
          console.error('[InvoiceService] Error queuing email for credit invoice:', emailErr);
        }
      }

      return invoice;
    });
  }
}

// Helpers
import crypto from 'crypto';

async function getOrCreateAccount(tx: any, companyId: string, code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense') {
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
    .map((line, idx) => `
    <DetalleItem>
      <NumeroLinea>${idx + 1}</NumeroLinea>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>${line.name}</NombreItem>
      <CantidadItem>${line.quantity.toFixed(4)}</CantidadItem>
      <PrecioUnitarioItem>${line.unitPrice.toFixed(2)}</PrecioUnitarioItem>
      <DescuentoMonto>${line.discount.toFixed(2)}</DescuentoMonto>
      <MontoItem>${line.total.toFixed(2)}</MontoItem>
    </DetalleItem>`)
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
