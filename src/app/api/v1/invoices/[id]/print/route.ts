import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, invoices, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions, ecfSequences, invoiceRetentions, productCategories, warehouses } from '@/db';
import { eq, and } from 'drizzle-orm';
import { envioVigente, firmaDelComprobante } from '@/repositories/dgiiSubmissionRepository';
import { urlConsultaDgii } from '@/services/dgii/codigoSeguridad';
import { verifyAuth } from '@/middleware/auth';

async function getInvoicePdfBuffer(invoiceId: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', isReprint: boolean = false) {
  // 1. Fetch invoice from DB
  const [invoiceRecordDb] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), eq(invoices.modo, modo)))
    .limit(1);

  if (!invoiceRecordDb) {
    throw new Error('Invoice not found');
  }

  // 2. Fetch company and settings
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, invoiceRecordDb.companyId))
    .limit(1);

  const [settings] = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.companyId, invoiceRecordDb.companyId))
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
        eq(ecfSequences.companyId, invoiceRecordDb.companyId),
        eq(ecfSequences.modo, modo),
        eq(ecfSequences.ecfType, invoiceRecordDb.ecfType)
      )
    )
    .limit(1);

  // Era `: '31-12-2027'`. Una fecha de vencimiento inventada, impresa en el
  // comprobante del cliente bajo el rotulo "Fecha Vencimiento". Sin fecha no se
  // imprime la linea: la plantilla ya la omite cuando esto es null.
  const ncfExpiry = sequence?.sequenceExpiry
    || (sequence?.expiryDate ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : null);

  if (!company) {
    throw new Error('Company profile not found');
  }

  // 3. Fetch customer details if they exist
  let customer = null;
  if (invoiceRecordDb.customerId) {
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, invoiceRecordDb.customerId))
      .limit(1);
    customer = cust;
  }

  // 4. Fetch lines and join with product details, categories and warehouses
  const lines = await db
    .select({
      quantity: invoiceLines.quantity,
      unitPrice: invoiceLines.unitPrice,
      discount: invoiceLines.discount,
      total: invoiceLines.total,
      productName: products.name,
      productSku: products.sku,
      unitOfMeasure: products.unitOfMeasure,
      categoryName: productCategories.name,
      warehouseName: warehouses.name,
    })
    .from(invoiceLines)
    .leftJoin(products, eq(invoiceLines.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(warehouses, eq(invoiceLines.warehouseId, warehouses.id))
    .where(eq(invoiceLines.invoiceId, invoiceId));

  // 5. Fetch taxes
  const taxes = await db
    .select()
    .from(invoiceTaxes)
    .where(eq(invoiceTaxes.invoiceId, invoiceId));

  // 5.1. Fetch retentions
  const retentions = await db
    .select()
    .from(invoiceRetentions)
    .where(eq(invoiceRetentions.invoiceId, invoiceId));

  // Fetch dgii submission to retrieve security code and QR code from mseller
  // Una factura puede tener varios envios: uno por cada intento. Antes esto
  // cogia una fila cualquiera (.limit(1) sin ORDER BY), y de esa fila salen
  // el codigo de seguridad y el QR del comprobante. La eleccion vive ahora
  // en un solo sitio: envioVigente.
  const submission = await envioVigente(invoiceId, companyId, modo);

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
  const firma = firmaDelComprobante(invoiceRecordDb, submission);
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
      rncComprador: invoiceRecordDb.buyerRnc,
      ncf: invoiceRecordDb.ncf,
      fecha: invoiceRecordDb.createdAt,
      total: Number(invoiceRecordDb.total),
      codigoSeguridad: securityCode,
    });
    if (urlConsulta) qrBase64 = await PdfGenerator.generateQrBase64(urlConsulta);
  }

  const invoiceRecord = {
    ncf: invoiceRecordDb.ncf,
    ecfType: invoiceRecordDb.ecfType,
    paymentType: invoiceRecordDb.paymentType,
    createdAt: invoiceRecordDb.createdAt.toISOString(),
    paymentStatus: invoiceRecordDb.paymentStatus,
    subtotal: Number(invoiceRecordDb.subtotal),
    discount: Number(invoiceRecordDb.discount),
    totalTaxes: Number(invoiceRecordDb.totalTaxes),
    total: Number(invoiceRecordDb.total),
    totalRetained: Number(invoiceRecordDb.totalRetained || 0),
    totalNet: Number(invoiceRecordDb.totalNet || invoiceRecordDb.total),
    notes: invoiceRecordDb.notes || '',
    codigoFactura: invoiceRecordDb.codigoFactura,
    securityCode,
    //  EL ESTADO, no solo el codigo. mSeller devuelve `securityCode` AUNQUE la
    //  DGII rechace -- comprobado: E440000000001 volvio 'rejected' con codigo
    //  JW0T3M. Condicionar la leyenda de firma a que exista codigo haria que un
    //  comprobante RECHAZADO se imprimiera como firmado valido.
    estadoFiscal: invoiceRecordDb.status,
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
      total: Number(l.total),
      categoryName: l.categoryName || 'General',
      warehouseName: l.warehouseName || 'Almacén Principal'
    })),
    taxes: taxes.map(t => ({
      taxType: t.taxType,
      rate: Number(t.rate),
      amount: Number(t.amount)
    })),
    retentions: retentions.map(r => ({
      retentionId: r.retentionId || undefined,
      retentionName: r.retentionName,
      retentionType: r.retentionType,
      retentionPercentage: Number(r.retentionPercentage),
      retentionAmount: Number(r.retentionAmount)
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
        printCopies: isReprint ? 1 : (settings?.printCopies ?? 2)
      }
    },
    customer: customer ? {
      name: customer.name,
      rncCedula: customer.rncCedula,
      phone: customer.phone || '',
      address: customer.address || ''
    } : {
      name: invoiceRecordDb.buyerName || 'Consumidor Final',
      rncCedula: invoiceRecordDb.buyerRnc || '',
      phone: '',
      address: ''
    }
  };

  // 4. Renderizar HTML según el layout
  const layout = invoiceRecord.company.settings.printLayout as 'carta' | '80mm' | '58mm';
  const html = DocumentTemplates.renderInvoice(invoiceRecord, layout, qrBase64);

  // 5. Convertir HTML a PDF en memoria
  const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, layout);

  const customerName = invoiceRecord.customer?.name || 'Cliente';
  let reason = 'Factura';
  if (invoiceRecord.ecfType === '34') reason = 'Nota de Credito';
  else if (invoiceRecord.ecfType === '33') reason = 'Nota de Debito';

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const printDate = `${day}-${month}-${year}`;

  const cleanCustomerName = customerName.replace(/[/\\?%*:|"<>]/g, '_').trim();
  const cleanNcf = (invoiceRecord.ncf || invoiceId).replace(/[/\\?%*:|"<>]/g, '_').trim();
  const finalFilename = `${cleanCustomerName} - ${reason} - ${cleanNcf} - ${printDate}.pdf`;

  return {
    pdfBuffer,
    filename: finalFilename
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { id: invoiceId } = await params;
    const { searchParams } = new URL(request.url);
    const isReprint = searchParams.get('reprint') === 'true';
    const { pdfBuffer, filename } = await getInvoicePdfBuffer(invoiceId, session.companyId, session.modo, isReprint);

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error printing invoice GET:', error);
    return new NextResponse(`Error al generar vista de impresión: ${error.message}`, {
      status: error.message === 'Invoice not found' ? 404 : 500
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id: invoiceId } = await params;
    const { pdfBuffer } = await getInvoicePdfBuffer(invoiceId, session.companyId, session.modo);

    // 6. Almacenar el archivo temporalmente
    const documentId = await DocumentService.saveTemporaryFile(pdfBuffer, 'pdf');

    // 7. Generar URL firmada
    const signedUrl = DocumentService.generateSignedUrl(documentId, 10); // Expiración 10 minutos

    return NextResponse.json({
      url: signedUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }, { headers: resHeaders });

  } catch (error: any) {
    console.error('Error printing invoice POST:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
