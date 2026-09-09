import { db, products, productCategories, auditLogs } from '@/db';
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
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult, InvoiceItemLine } from './types';
import type { CompanyRepository } from '@/repositories/companyRepository';

export class InvoiceFileGenerator {
  /**
   * Auditoria P2-30 (2026-09-03): deja constancia de un fallo POSTERIOR al
   * commit de la factura.
   *
   * Todo lo que corre despues de `executeDbTransaction` -- PDF, correo,
   * conduce automatico, marcado de la cotizacion -- va fuera de la
   * transaccion, y hasta ahora un fallo ahi solo dejaba una linea de log SIN
   * el NCF ni el id de la factura: el caso existia pero no habia manera de
   * encontrarlo despues.
   *
   * El del conduce es el grave. Facturar NO descuenta stock: la deduccion
   * esta diferida al conduce (ver invoiceDbBooker). Si el conduce automatico
   * no llega a aprobarse, la factura queda emitida y el inventario sin tocar,
   * que es exactamente el desfase silencioso del hallazgo.
   *
   * Mismo patron que `InvoiceDbBooker.registrarNcfSinUsar`: traza durable en
   * audit_logs y NUNCA relanza -- ya se esta atendiendo un error, y tumbar la
   * emision porque falle la escritura de la traza seria cambiar un problema
   * por otro peor.
   */
  private static async registrarFalloPostEmision(
    data: IssueInvoiceInput,
    invoiceId: string | null,
    ncf: string,
    paso: string,
    err: unknown
  ) {
    try {
      await db.insert(auditLogs).values({
        companyId: data.companyId,
        userId: data.userId,
        modo: data.modo,
        action: 'fallo_post_emision',
        entityType: 'invoices',
        entityId: invoiceId ?? undefined,
        newValues: { paso, ncf, motivo: (err as Error)?.message || String(err) },
        ipAddress: 'server',
      });
    } catch (trazaErr) {
      Logger.error(
        `[InvoiceFileGenerator] No se pudo registrar el fallo post-emision (${paso}) del NCF ${ncf}:`,
        trazaErr
      );
    }
  }

  /**
   * Helper to write files and send the invoice to the customer asynchronously.
   *
   * Devuelve los avisos que hay que ensenar a quien acaba de facturar: lo que
   * falla aqui ya no puede deshacer la emision, pero tampoco puede quedarse
   * en un log que nadie mira.
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
  ): Promise<string[]> {
    const avisos: string[] = [];

    // SIN VEREDICTO NO HAY DOCUMENTO.
    //
    // La DGII no acepta en el momento del envio: al emitir, la factura no tiene
    // todavia codigo de seguridad ni fecha de firma, porque los produce la DGII
    // al firmar. Un PDF hecho ahora sale sin QR y sin esos dos campos -- un
    // comprobante a medias que ademas se guarda como si fuera el definitivo.
    //
    // Asi que no se genera. El documento se produce cuando la DGII ACEPTA, desde
    // services/invoice/correoFactura.ts, y solo entonces. Rechazada no imprime:
    // un comprobante que la DGII no acepto no es un comprobante, y un PDF suyo
    // solo sirve para que alguien lo confunda con uno valido.
    //
    // Quien necesite el papel antes de que la DGII conteste lo tiene en el boton
    // de imprimir, que arma el PDF al vuelo leyendo la factura y no inventa nada.
    if (submission.finalStatus !== 'accepted') {
      return avisos;
    }

    try {
      // EL CODIGO DE SEGURIDAD ES EL QUE DEVOLVIO mSELLER, O NINGUNO.
      //
      // Aqui se fabricaba uno cuando no venia: un sha256 de `signedXml`, que no
      // era el XML firmado sino la cadena literal
      // '<ECF>Firmado asincronamente</ECF>' -- una CONSTANTE. El codigo inventado
      // era por tanto SIEMPRE EL MISMO (C71D2DC8464CDC7A) y acababa impreso en el
      // QR de toda factura emitida antes de que la DGII resolviera, dentro de una
      // URL de consulta de la DGII que no puede responder por un codigo que no
      // existe. Ese PDF es ademas el que se le manda al cliente por correo.
      //
      // Y el guardia que hay mas abajo -- "sin codigo, mejor sin QR" -- estaba
      // puesto justo para esto y no disparaba NUNCA, porque esta fabricacion se
      // aseguraba de que el codigo jamas estuviera vacio.
      //
      // Era la ultima copia viva del patron que ya se elimino de las cuatro rutas
      // de impresion y correo (ver el comentario de invoices/[id]/print). Sin
      // codigo real no hay QR; al reimprimir despues de sincronizar, la ruta de
      // impresion lee la firma de la factura y el QR aparece de verdad.
      //
      // `rawXml` y `signedXml` vivian aqui solo para alimentar esa invencion.
      const securityHash = submission.securityHash || '';

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
        // LA FECHA DE FIRMA ES LA QUE DIJO mSELLER, O NINGUNA.
        //
        // Aqui decia `new Date().toISOString()`, que no es la fecha de firma:
        // es la hora de generar el PDF. Igual que el codigo de seguridad, es un
        // dato del comprobante que solo existe cuando la DGII firma, y hasta
        // entonces no consta. La ruta de impresion ya lo hacia bien -- lee
        // `firma.fechaFirma` -- y esta se quedo poniendo el reloj.
        signatureDate: submission.signatureDate || null,
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

      // EL CORREO AL CLIENTE ESPERA AL VEREDICTO DE LA DGII.
      //
      // La DGII no acepta en el momento del envio, asi que al emitir la factura
      // suele quedar en 'submitted'. Mandar el PDF en ese momento significa
      // mandarle al cliente un comprobante todavia sin codigo de seguridad y,
      // por tanto, sin QR de consulta -- y ese correo ya no se puede recoger.
      //
      // Solo se manda si la DGII YA acepto (mSeller puede responder aceptado en
      // el mismo envio). Si quedo pendiente, el correo se manda al pasar a
      // aceptada, y mientras tanto esta el boton de reenviar de la pantalla de
      // facturas, que arma el PDF con la firma real.
      if (data.customerId && submission.finalStatus === 'accepted') {
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
          await this.registrarFalloPostEmision(data, null, ncf, 'correo_cliente', emailErr);
          avisos.push(
            'La factura se emitió correctamente, pero no se pudo encolar el correo al cliente. ' +
            'Puedes reenviarlo desde el listado de facturas.'
          );
        }
      }
    } catch (pdfErr: unknown) {
      Logger.error('[InvoiceFileGenerator] Error generating PDF or XML outside transaction', pdfErr);
      await this.registrarFalloPostEmision(data, null, ncf, 'pdf_o_xml', pdfErr);
      avisos.push(
        'La factura se emitió correctamente, pero no se pudo generar o subir su PDF. ' +
        'El comprobante es válido; vuelve a imprimirlo desde el listado de facturas.'
      );
    }

    return avisos;
  }

  /**
   * Helper to perform follow up operations (delivery note, quote status).
   *
   * Crear y aprobar el conduce iban bajo un mismo `catch`, asi que los dos
   * fallos posibles quedaban indistinguibles -- y son distintos: si falla
   * `create` no hay conduce ninguno; si falla `approve` queda un BORRADOR que
   * tampoco mueve stock, pero que se puede aprobar a mano sin rehacerlo. Se
   * separan para poder decir cual paso y que hacer.
   */
  static async processPostEmission(
    data: IssueInvoiceInput,
    invoiceId: string,
    ncf: string,
    settings: Awaited<ReturnType<typeof CompanyRepository.getSettings>>,
    itemLines: InvoiceItemLine[]
  ): Promise<string[]> {
    const avisos: string[] = [];

    // Automatically issue delivery note if autoDeliveryNotes is enabled
    if (settings?.autoDeliveryNotes && ['31', '32', '45'].includes(data.ecfType)) {
      let draftNoteId: string | null = null;

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
        draftNoteId = draftNote.id;
      } catch (autoErr) {
        Logger.error('[InvoiceFileGenerator] Error creating automatic delivery note', autoErr);
        await this.registrarFalloPostEmision(data, invoiceId, ncf, 'conduce_automatico_crear', autoErr);
        avisos.push(
          'La factura se emitió, pero NO se pudo generar el conduce automático: el inventario ' +
          'NO se ha descontado. Genera el conduce a mano desde Conduces.'
        );
      }

      if (draftNoteId) {
        try {
          await DeliveryRepository.approve(draftNoteId, data.userId, data.companyId, data.modo);
        } catch (aprobarErr) {
          Logger.error('[InvoiceFileGenerator] Error approving automatic delivery note', aprobarErr);
          await this.registrarFalloPostEmision(data, invoiceId, ncf, 'conduce_automatico_aprobar', aprobarErr);
          avisos.push(
            'La factura se emitió y el conduce automático quedó en BORRADOR, pero no se pudo ' +
            'aprobar: el inventario NO se ha descontado. Apruébalo desde Conduces.'
          );
        }
      }
    }

    if (data.quoteId) {
      try {
        const { QuoteService } = await import('@/services/quoteService');
        await QuoteService.markAsInvoiced(data.quoteId, data.companyId, data.modo);
      } catch (err) {
        Logger.error('[InvoiceFileGenerator] Error marking quote as invoiced', err);
        await this.registrarFalloPostEmision(data, invoiceId, ncf, 'cotizacion_marcar_facturada', err);
        avisos.push(
          'La factura se emitió, pero la cotización de origen no quedó marcada como facturada. ' +
          'Ciérrala a mano desde Cotizaciones.'
        );
      }
    }

    return avisos;
  }
}
