import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions, ecfSequences, productCategories } from '@/db';
import { eq, and } from 'drizzle-orm';
import { envioVigente, firmaDelComprobante } from '@/repositories/dgiiSubmissionRepository';
import { urlConsultaDgii } from '@/services/dgii/codigoSeguridad';

/**
 * SE RETIRO LA AUTENTICACION POR `?token=`
 * ----------------------------------------
 * Esta ruta aceptaba, ademas de la sesion, un JWT en la barra de direcciones:
 * `/api/v1/invoices/<id>/pdf?token=...`. Se retira, y conviene dejar escrito
 * por que, porque a primera vista parecia una funcion util:
 *
 *  1. Nadie firmaba esos tokens. No hay un solo `jwt.sign` con `invoiceId` en
 *     el repositorio -- ni ahora ni en la historia del fichero, que solo tiene
 *     el commit de la auditoria. Era andamiaje que nunca se conecto.
 *  2. Los cuatro sitios que abren el PDF (dos en la pantalla de facturas, uno
 *     en el detalle y otro en ajustes) usan `window.open` con la cookie de
 *     sesion. Ninguno construye un `?token=`.
 *  3. Se SALTABA `enforcePermission`. La rama de sesion exige permiso de
 *     lectura sobre facturacion; la del token no comprobaba nada mas alla de
 *     la firma. Un token valido daba el PDF a quien no tiene ese permiso.
 *  4. Un credencial en la barra de direcciones queda en los registros del
 *     servidor, en el historial del navegador y en la cabecera Referer.
 *
 * Si en algun momento hace falta entregar una factura a alguien sin sesion, el
 * sistema YA tiene el mecanismo correcto y es mejor que este: `documentShares`
 * (DocumentService.createShareToken), con testigo aleatorio de 32 bytes
 * guardado en la base, caducidad y posibilidad de revocarlo.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;

    let companyId: string | null = null;
    let modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION';
    const resHeaders = new Headers();

    // Autenticacion por cookie de sesion, con permiso de lectura. Unica via.
    const auth = await verifyAuth(req, resHeaders);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
        { status: 401 }
      );
    }
    try {
      await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');
      companyId = auth.companyId;
      modo = auth.modo;
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: err.message } },
        { status: 403, headers: resHeaders }
      );
    }

    if (!companyId) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const invoice = await InvoiceRepository.getById(id, companyId, modo);
    if (!invoice) {
      return new NextResponse('Factura no encontrada.', { status: 404 });
    }

    // Fetch company and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, invoice.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, invoice.companyId))
      .limit(1);

    // Fetch NCF sequence details to get the expiration date
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
          eq(ecfSequences.companyId, invoice.companyId),
          eq(ecfSequences.modo, modo),
          eq(ecfSequences.ecfType, invoice.ecfType)
        )
      )
      .limit(1);

    const ncfExpiry = sequence?.sequenceExpiry || (sequence?.expiryDate ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : '31-12-2027');

    if (!company) {
      return new NextResponse('Company profile not found', { status: 404 });
    }

    // Fetch customer details if they exist
    let customer = null;
    if (invoice.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, invoice.customerId))
        .limit(1);
      customer = cust;
    }

    // Fetch lines and join with product details and categories
    const lines = await db
      .select({
        quantity: invoiceLines.quantity,
        unitPrice: invoiceLines.unitPrice,
        discount: invoiceLines.discount,
        total: invoiceLines.total,
        // La tasa de CADA linea (migracion 0039). Sin esto la plantilla tenia
        // que adivinarla del resumen agregado y aplicar una sola a todas.
        taxRate: invoiceLines.taxRate,
        productName: products.name,
        productSku: products.sku,
        unitOfMeasure: products.unitOfMeasure,
        categoryName: productCategories.name,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(invoiceLines.productId, products.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(eq(invoiceLines.invoiceId, id));

    // Fetch taxes
    const taxes = await db
      .select()
      .from(invoiceTaxes)
      .where(eq(invoiceTaxes.invoiceId, id));

    // Fetch dgii submission to retrieve security code and QR code from mseller
    // Una factura puede tener varios envios: uno por cada intento. Antes esto
    // cogia una fila cualquiera (.limit(1) sin ORDER BY), y de esa fila salen
    // el codigo de seguridad y el QR del comprobante. La eleccion vive ahora
    // en un solo sitio: envioVigente.
    const submission = await envioVigente(id, companyId, modo);

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
        rncEmisor: company.rnc,
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
        // `null` se conserva como `null`: significa "no consta" (factura vieja
        // con varias tasas). La plantilla decide que hacer, y no lo confunde
        // con una tasa de 0.
        taxRate: l.taxRate != null ? Number(l.taxRate) : null,
        productName: l.productName || 'Producto/Servicio',
        productSku: l.productSku || 'N/A',
        unitOfMeasure: l.unitOfMeasure || 'Unidad',
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        total: Number(l.total),
        categoryName: l.categoryName || 'General'
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
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        logoUrl: settings?.logoUrl || undefined,
        settings: { 
          printLayout: settings?.printLayout || 'carta',
          printCopies: 1
        }
      },
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

    // Render HTML and convert to PDF dynamically
    const layout = invoiceRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
    const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${invoice.ncf}.pdf"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers
    });
  } catch (error: any) {
    console.error('Error in PDF download direct stream:', error);
    return new NextResponse(`Error interno al generar PDF: ${error.message}`, { status: 500 });
  }
}
