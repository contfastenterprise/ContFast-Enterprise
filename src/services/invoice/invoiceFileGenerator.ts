import { db, products, productCategories } from '@/db';
import { urlConsultaDgii } from '@/services/dgii/codigoSeguridad';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { addJob } from '@/infrastructure/queue';
import { CustomerRepository } from '@/repositories/customerRepository';
import { DeliveryRepository } from '@/repositories/deliveryRepository';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult, InvoiceItemLine } from './types';
import type { CompanyRepository } from '@/repositories/companyRepository';

export class InvoiceFileGenerator {
  /**
   * Helper to write files and send the invoice to the customer asynchronously.
   */
  static async generateFilesAndSendEmail(
    data: IssueInvoiceInput,
    ncf: string,
    company: NonNullable<Awaited<ReturnType<typeof CompanyRepository.getProfile>>>,
    settings: Awaited<ReturnType<typeof CompanyRepository.getSettings>>,
    totals: CalculatedTotals,
    submission: DgiiSubmissionResult,
    codigoFactura: string,
    invoicesDir: string,
    xmlPath: string,
    signedXmlPath: string,
    pdfPath: string,
    msellerXmlPath: string
  ) {
    try {
      const rawXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Generado asíncronamente</ECF>';
      const signedXml = '<?xml version="1.0" encoding="utf-8"?><ECF>Firmado asíncronamente</ECF>';

      let securityHash = submission.securityHash;
      if (!securityHash) {
        securityHash = crypto.createHash('sha256').update(signedXml).digest('hex').substring(0, 16).toUpperCase();
      }

      // Only upload PDF file to Supabase Storage. XML is handled directly from mSeller path.

      // Fetch real product SKUs and units of measure
      const productIds = totals.itemLines.map((l) => l.productId).filter(Boolean);
      let dbProducts: { id: string; sku: string | null; unitOfMeasure: string | null; categoryName: string | null }[] = [];
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
          // Los productIds salen de lines[].productId del cuerpo de la peticion
          // y el esquema Zod de POST /api/v1/invoices solo valida que sean UUID.
          // Sin el filtro por empresa, mandando el UUID de un producto ajeno su
          // sku, unidad y categoria acababan impresos en el PDF fiscal que esta
          // empresa envia a su cliente.
          .where(and(
            inArray(products.id, productIds as string[]),
            eq(products.companyId, data.companyId)
          ));
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
          // ISO-17: sin respaldos. Un dato de contacto que no es de esta
          // empresa acaba impreso en SU comprobante fiscal, y el que habia
          // aqui era el de un cliente concreto. Si la empresa no lo tiene
          // configurado, el comprobante sale sin el: en blanco es correcto,
          // el telefono de otro no.
          address: company.address || '',
          phone: company.phone || '',
          email: company.email || '',
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
        // Sin QR de mSeller se construye la consulta de la DGII, pero SOLO si
        // hay codigo de seguridad. Antes se construia siempre, y cuando el
        // codigo no constaba salia un QR con `codigoSeguridad=` vacio: un QR
        // impreso en un comprobante fiscal que lleva a una consulta que no
        // puede responder. Sin codigo, mejor sin QR.
        const urlConsulta = urlConsultaDgii({
          rncEmisor: company.rnc,
          rncComprador: data.buyerRnc,
          ncf,
          fecha: new Date(),
          total: Number(totals.total),
          codigoSeguridad: securityHash,
        });
        if (urlConsulta) qrBase64 = await PdfGenerator.generateQrBase64(urlConsulta);
      }

      const layout = (settings?.printLayout as 'carta' | '80mm' | '58mm') || 'carta';
      const html = DocumentTemplates.renderInvoice(formattedInvoiceRecord, layout, qrBase64);
      const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);
      const { StorageService } = await import('@/services/storageService');
      const { bucketName: pdfBucket, filePath: pdfFile } = StorageService.parseDbPath(pdfPath);
      await StorageService.uploadFile(pdfBucket, pdfFile, pdfBuffer, 'application/pdf');

      // Send invoice email if customer has a registered email
      if (data.customerId) {
        try {
          const customer = await CustomerRepository.findById(data.customerId, data.companyId);
          // Sin nombre de empresa NO se manda el correo. Iba firmado
          // "Atentamente, ${companyName}", y ese nombre caia en 'ContFast'
          // -- el nombre del PRODUCTO -- cuando faltaba. Un correo a un
          // cliente firmado por una empresa que no es la suya es peor que no
          // mandarlo: la factura ya esta emitida y el PDF generado, esto solo
          // era el aviso. Se registra y se sigue.
          if (customer && customer.email && !company?.name) {
            Logger.error(
              `[InvoiceFileGenerator] No hay nombre de empresa: NO se envia el aviso del NCF ${ncf} ` +
              `a ${customer.email}. La factura y el PDF si se generaron.`
            );
          } else if (customer && customer.email) {
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
            const companyName = company.name;

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
    } catch (pdfErr: unknown) {
      Logger.error('[InvoiceFileGenerator] Error generating PDF or XML outside transaction', pdfErr);
    }
  }

  /**
   * Helper to perform follow up operations (delivery note, quote status).
   */
  static async processPostEmission(
    data: IssueInvoiceInput,
    invoiceId: string,
    settings: Awaited<ReturnType<typeof CompanyRepository.getSettings>>,
    itemLines: InvoiceItemLine[]
  ) {
    // Automatically issue delivery note if autoDeliveryNotes is enabled
    if (settings?.autoDeliveryNotes && ['31', '32', '45'].includes(data.ecfType)) {
      try {
        const draftNote = await DeliveryRepository.create({
          companyId: data.companyId,
          modo: data.modo,
          invoiceId: invoiceId,
          userId: data.userId,
          deliveryDate: new Date(),
          driverName: 'Despacho Automático',
          dispatcherName: 'Sistema',
          notes: 'Conduce generado automáticamente al emitir la factura.',
          lines: itemLines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
          })),
        });

        await DeliveryRepository.approve(draftNote.id, data.userId, data.companyId, data.modo);
      } catch (autoErr) {
        Logger.error('[InvoiceFileGenerator] Error creating automatic delivery note', autoErr);
      }
    }

    if (data.quoteId) {
      try {
        const { QuoteService } = await import('@/services/quoteService');
        await QuoteService.markAsInvoiced(data.quoteId, data.companyId, data.modo);
      } catch (err) {
        Logger.error('[InvoiceFileGenerator] Error marking quote as invoiced', err);
      }
    }
  }
}
