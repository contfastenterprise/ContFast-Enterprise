import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { Logger } from '@/utils/logger';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { CustomerRepository } from '@/repositories/customerRepository';
import { addJob } from '@/infrastructure/queue';
import { CompanyRepository } from '@/repositories/companyRepository';
import { db, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions, ecfSequences } from '@/db';
import { eq, and } from 'drizzle-orm';
import { envioVigente, firmaDelComprobante } from '@/repositories/dgiiSubmissionRepository';
import { urlConsultaDgii } from '@/services/dgii/codigoSeguridad';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const invoice = await InvoiceRepository.getById(id, auth.companyId, auth.modo);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (!invoice.customerId) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'La factura no tiene un cliente asociado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    const customer = await CustomerRepository.findById(invoice.customerId, auth.companyId);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'El cliente asociado no existe o fue eliminado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    if (!customer.email) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_EMAIL', message: 'El cliente no tiene un correo electrónico registrado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    const company = await CompanyRepository.getProfile(auth.companyId);
    // Un correo a un CLIENTE firmado por una empresa inventada ('ContFast',
    // que ademas es el nombre del producto) no se envia. `companies.name` es
    // NOT NULL: si esto falta, es que la busqueda fallo.
    if (!company) {
      return NextResponse.json(
        { success: false, error: { message: 'No se encontro la empresa emisora. No se envia el correo.' } },
        { status: 404 }
      );
    }
    const companyName = company.name;

    // Always regenerate PDF before sending to ensure it contains the correct SKUs
    let pdfPath = invoice.pdfPath;
    if (pdfPath) {
      try {
        const settings = await CompanyRepository.getSettings(auth.companyId);
        
        const [sequence] = await db
          .select({
            expiryDate: ecfSequences.expiryDate,
            sequenceExpiry: ecfSequences.sequenceExpiry,
          })
          .from(ecfSequences)
          .where(
            and(
              // `ecf_sequences` tiene indice unico (company_id, ecf_type, modo):
              // hay DOS filas candidatas, una por entorno, y con `.limit(1)` sin
              // orden salia la que quisiera el planificador. De esta fila sale
              // la fecha de vencimiento del NCF que se IMPRIME en el
              // comprobante fiscal: un documento real podia salir con la
              // caducidad de la secuencia de pruebas.
              eq(ecfSequences.companyId, auth.companyId),
              eq(ecfSequences.modo, auth.modo),
              eq(ecfSequences.ecfType, invoice.ecfType)
            )
          )
          .limit(1);

        const ncfExpiry = sequence?.sequenceExpiry || (sequence?.expiryDate ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : '31-12-2027');

        // Fetch lines with product SKU
        const lines = await db
          .select({
            quantity: invoiceLines.quantity,
            unitPrice: invoiceLines.unitPrice,
            discount: invoiceLines.discount,
            total: invoiceLines.total,
            productName: products.name,
            productSku: products.sku,
            unitOfMeasure: products.unitOfMeasure,
          })
          .from(invoiceLines)
          .leftJoin(products, eq(invoiceLines.productId, products.id))
          .where(eq(invoiceLines.invoiceId, id));

        // Fetch taxes
        const taxes = await db
          .select()
          .from(invoiceTaxes)
          .where(eq(invoiceTaxes.invoiceId, id));

        // Una factura puede tener varios envios: uno por cada intento. Antes esto
        // cogia una fila cualquiera (.limit(1) sin ORDER BY), y de esa fila salen
        // el codigo de seguridad y el QR del comprobante. La eleccion vive ahora
        // en un solo sitio: envioVigente.
        const submission = await envioVigente(id, auth.companyId, auth.modo);

        // La lectura del codigo de seguridad, el QR y la fecha de firma vive en
        // firmaDelComprobante. Aqui habia treinta lineas repetidas en cuatro rutas
        // que acababan en:
        //
        //     if (!securityCode) securityCode = sha256(id + ncf).slice(0,16)
        //
        // o sea, inventarse el codigo de seguridad de un comprobante fiscal. Y
        // peor: el QR se construia con ESE codigo inventado apuntando a la
        // consulta de la DGII, donde no puede validar nunca.
        // DB-23: la firma sale de la FACTURA, y del envio solo como respaldo. Antes
        // se leia unicamente del envio, donde el `response_payload` lo reescribe
        // cualquier consulta de estado: sincronizar una factura aceptada le borraba
        // el codigo de seguridad y la fecha de firma.
        const firma = firmaDelComprobante(invoice, submission);
        const securityCode = firma.codigo;
        const signedDate = firma.fechaFirma;
        let qrBase64 = '';
        if (firma.qr) {
          qrBase64 = firma.qr.startsWith('http')
            ? await PdfGenerator.generateQrBase64(firma.qr)
            : firma.qr;
        } else if (securityCode) {
          // Sin QR de mSeller pero CON codigo real, la consulta se puede construir
          // y sirve. Sin codigo no se genera ningun QR: un QR que lleva a la DGII a
          // preguntar por un codigo inexistente es peor que no tenerlo.
          const urlConsulta = urlConsultaDgii({
            rncEmisor: company?.rnc,
            rncComprador: invoice.buyerRnc,
            ncf: invoice.ncf,
            fecha: invoice.createdAt,
            total: Number(invoice.total),
            codigoSeguridad: securityCode,
          });
          if (urlConsulta) qrBase64 = await PdfGenerator.generateQrBase64(urlConsulta);
        }

        const invoiceRecord = {
          ncf: invoice.ncf,
          ecfType: invoice.ecfType,
          paymentType: invoice.paymentType,
          createdAt: invoice.createdAt.toISOString(),
          paymentStatus: invoice.paymentStatus,
          subtotal: Number(invoice.subtotal),
          discount: Number(invoice.discount),
          totalTaxes: Number(invoice.totalTaxes),
          total: Number(invoice.total),
          totalRetained: Number(invoice.totalRetained || 0),
          totalNet: Number(invoice.totalNet || invoice.total),
          notes: invoice.notes || '',
          codigoFactura: invoice.codigoFactura,
          securityCode,
          // DB-23: sin respaldo a la fecha de CREACION. Son cosas distintas y la
      // DGII compara contra la suya; poner una por otra es firmar con una
      // fecha que no es. Vacia significa pendiente, y asi se imprime.
      signatureDate: signedDate || null,
          ncfExpiryDate: ncfExpiry,
          lines: lines.map(l => ({
            quantity: Number(l.quantity),
            productName: l.productName || 'Producto/Servicio',
            productSku: l.productSku || 'N/A',
            unitOfMeasure: l.unitOfMeasure || 'Unidad',
            unitPrice: Number(l.unitPrice),
            discount: Number(l.discount),
            total: Number(l.total)
          })),
          taxes: taxes.map(t => ({
            taxType: t.taxType,
            rate: Number(t.rate),
            amount: Number(t.amount)
          })),
          retentions: (invoice.retentions || []).map((r: any) => ({
            retentionId: r.retentionId || undefined,
            retentionName: r.retentionName,
            retentionType: r.retentionType,
            retentionPercentage: Number(r.retentionPercentage),
            retentionAmount: Number(r.retentionAmount)
          })),
          company: company ? {
            name: company.name,
            rnc: company.rnc,
            address: company.address || 'Santiago, R.D.',
            phone: company.phone || '1-829-214-4128',
            email: company.email || settings?.msellerEmail || 'latindoors@gmail.com',
            logoUrl: settings?.logoUrl || undefined,
            settings: { 
              printLayout: settings?.printLayout || 'carta' 
            }
          } : null,
          customer: customer ? {
            name: customer.name,
            rncCedula: customer.rncCedula,
            phone: customer.phone || '',
            address: customer.address || ''
          } : {
            name: invoice.buyerName || 'Consumidor Final',
            rncCedula: invoice.buyerRnc || '',
            phone: '',
            address: ''
          }
        };

        const layout = settings?.printLayout as 'carta' | '80mm' | '58mm' || 'carta';
        const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);
        const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);
        
        const resolvedPath = path.isAbsolute(pdfPath) ? pdfPath : path.join(/*turbopackIgnore: true*/ process.cwd(), pdfPath);
        const pdfDir = path.dirname(resolvedPath);
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, pdfBuffer);
        Logger.info(`[Email Route] Regenerated PDF successfully at ${resolvedPath}`);
      } catch (err: any) {
        Logger.error('[Email Route] Failed to regenerate PDF on the fly', err);
      }
    }

    let docName = 'Factura';
    let typeStr = invoice.paymentType === 'credit' ? ' a crédito' : '';
    if (invoice.ecfType === '33') {
      docName = 'Nota de Débito';
      typeStr = '';
    } else if (invoice.ecfType === '34') {
      docName = 'Nota de Crédito';
      typeStr = '';
    }

    const subject = `Reenvío de ${docName}${typeStr} - NCF: ${invoice.ncf}`;

    // Queue resending the email
    await addJob('emails-sending', 'send-email', {
      to: customer.email,
      subject,
      text: `Estimado(a) ${customer.name},\n\nLe reenviamos su ${docName.toLowerCase()}${typeStr} NCF: ${invoice.ncf} por un valor total de RD$ ${invoice.total}.\n\nAtentamente,\n${companyName}`,
      html: `<p>Estimado(a) <strong>${customer.name}</strong>,</p><p>Le reenviamos su ${docName.toLowerCase()}${typeStr} NCF: <strong>${invoice.ncf}</strong> por un valor total de <strong>RD$ ${invoice.total}</strong>.</p><p>Atentamente,<br/>${companyName}</p>`,
      pdfPath: pdfPath || undefined,
    });

    return NextResponse.json(
      { success: true, message: `Correo reenviado exitosamente a ${customer.email}.` },
      { headers: resHeaders }
    );
  } catch (error: any) {
    Logger.error('Error in POST /api/v1/invoices/[id]/email', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
