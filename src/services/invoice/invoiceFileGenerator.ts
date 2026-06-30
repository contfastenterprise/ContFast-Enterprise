import { db, products, productCategories } from '@/db';
import { sql, eq, inArray } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { addJob } from '@/infrastructure/queue';
import { CustomerRepository } from '@/repositories/customerRepository';
import { DeliveryRepository } from '@/repositories/deliveryRepository';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult } from './types';

export class InvoiceFileGenerator {
  /**
   * Helper to write files and send the invoice to the customer asynchronously.
   */
  static async generateFilesAndSendEmail(
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
            categoryName: productCategories.name,
          })
          .from(products)
          .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
          .where(inArray(products.id, productIds as string[]));
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
            categoryName: prod?.categoryName || 'General',
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
            Logger.info(`[InvoiceFileGenerator] Invoice email queued for customer ${customer.email} regarding NCF ${ncf} with attachment ${pdfPath}`);
          }
        } catch (emailErr) {
          Logger.error('[InvoiceFileGenerator] Error queuing email for invoice', emailErr);
        }
      }
    } catch (pdfErr: any) {
      Logger.error('[InvoiceFileGenerator] Error generating PDF or XML outside transaction', pdfErr);
    }
  }

  /**
   * Helper to perform follow up operations (delivery note, quote status).
   */
  static async processPostEmission(
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
        Logger.error('[InvoiceFileGenerator] Error creating automatic delivery note', autoErr);
      }
    }

    if (data.quoteId) {
      try {
        const { QuoteService } = await import('@/services/quoteService');
        await QuoteService.markAsInvoiced(data.quoteId);
      } catch (err) {
        Logger.error('[InvoiceFileGenerator] Error marking quote as invoiced', err);
      }
    }
  }
}
