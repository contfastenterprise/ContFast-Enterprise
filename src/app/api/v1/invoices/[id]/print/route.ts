import { NextRequest, NextResponse } from 'next/server';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { DocumentService } from '@/services/print/documentService';
import { db, invoices, companies, companySettings, customers, invoiceLines, invoiceTaxes, products, dgiiSubmissions, ecfSequences, invoiceRetentions, productCategories, warehouses } from '@/db';
import { eq, and } from 'drizzle-orm';
import { envioVigente, firmaDelComprobante } from '@/repositories/dgiiSubmissionRepository';
import { qrDelComprobante } from '@/services/dgii/qrDelComprobante';
import { verifyAuth } from '@/middleware/auth';
import { Logger } from '@/utils/logger';
import { vencimientoSecuenciaSiConsta } from '@/services/dgii/secuencia';

async function getInvoicePdfBuffer(invoiceId: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', isReprint: boolean = false) {
  //  ── LAS CONSULTAS, EN DOS VIAJES EN VEZ DE NUEVE (lote 182) ─────────────
  //
  //  Aqui habia NUEVE `await` en fila, cada uno esperando al anterior. Medido
  //  el 2026-09-22 contra la base de PRODUCCION: entre 85 y 140 ms cada una,
  //  **1.073 ms en total**, y eso es casi todo tiempo de ida y vuelta, no de
  //  trabajo de la base. Con el pool de produccion (`max: 2`, ver
  //  `src/db/index.ts`) las mismas ocho en paralelo tardan **489 ms**.
  //
  //  Quien imprime ve una pestaña en blanco mientras esto pasa, asi que ese
  //  medio segundo es medio segundo de "esta cargando" con un cliente delante.
  //
  //  QUE DEPENDE DE QUE, que es lo unico que limita el paralelismo:
  //   · la empresa y sus ajustes van por `companyId`, que YA VIENE de la
  //     sesion. No hace falta esperar a la factura para pedirlos: la consulta
  //     de la factura filtra por ese mismo `companyId`, asi que
  //     `invoiceRecordDb.companyId` y el parametro son el mismo valor por
  //     construccion -- si no coincidieran, no habria factura que imprimir.
  //   · las lineas, los impuestos, las retenciones y el envio van por
  //     `invoiceId`, que tambien viene dado.
  //   · solo DOS necesitan la fila de la factura: la secuencia (por su
  //     `ecfType`) y el cliente (por su `customerId`). Esas dos son el segundo
  //     viaje.
  const [invoiceRecordDb, company, settings, lines, taxes, retentions, submission] = await Promise.all([
    db.select().from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), eq(invoices.modo, modo)))
      .limit(1).then((r) => r[0]),
    db.select().from(companies).where(eq(companies.id, companyId)).limit(1).then((r) => r[0]),
    db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1).then((r) => r[0]),
    db
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
      .where(eq(invoiceLines.invoiceId, invoiceId)),
    db.select().from(invoiceTaxes).where(eq(invoiceTaxes.invoiceId, invoiceId)),
    db.select().from(invoiceRetentions).where(eq(invoiceRetentions.invoiceId, invoiceId)),
    //  Una factura puede tener varios envios: uno por cada intento. Antes esto
    //  cogia una fila cualquiera (`.limit(1)` sin ORDER BY), y de esa fila salen
    //  el codigo de seguridad y el QR del comprobante. La eleccion vive en un
    //  solo sitio: `envioVigente`.
    envioVigente(invoiceId, companyId, modo),
  ]);

  //  EL ORDEN DE LOS ERRORES NO CAMBIA. Se comprueban despues de pedirlo todo,
  //  pero se lanzan en el mismo orden que antes: primero la factura, luego la
  //  empresa. Pedir de mas cuando la factura no existe cuesta dos consultas que
  //  no se usan; esperar nueve veces cuando si existe cuesta medio segundo en
  //  cada impresion.
  if (!invoiceRecordDb) {
    throw new Error('Invoice not found');
  }

  if (!company) {
    throw new Error('Company profile not found');
  }

  //  El segundo viaje: las dos que SI necesitan la fila de la factura.
  const [sequence, customer] = await Promise.all([
    db
      .select({
        expiryDate: ecfSequences.expiryDate,
        sequenceExpiry: ecfSequences.sequenceExpiry,
      })
      .from(ecfSequences)
      .where(
        and(
          // `ecf_sequences` tiene indice unico (company_id, ecf_type, modo):
          // hay DOS filas candidatas, una por entorno, y con `.limit(1)` sin
          // orden salia la que quisiera el planificador. De esta fila sale la
          // fecha de vencimiento del NCF que se IMPRIME en el comprobante
          // fiscal: un documento real podia salir con la caducidad de la
          // secuencia de pruebas.
          eq(ecfSequences.companyId, companyId),
          eq(ecfSequences.modo, modo),
          eq(ecfSequences.ecfType, invoiceRecordDb.ecfType)
        )
      )
      .limit(1).then((r) => r[0]),
    invoiceRecordDb.customerId
      ? db.select().from(customers).where(eq(customers.id, invoiceRecordDb.customerId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  // La misma regla que usa la emision, en el mismo sitio. Aqui habia una copia
  // escrita a mano que restaba un dia (`new Date` sobre una columna `date`) y
  // que ademas no rellenaba con ceros: daba "1-9-2026", que no es dd-MM-aaaa.
  // Sin fecha no se imprime la linea: la plantilla ya la omite cuando es null.
  const ncfExpiry = vencimientoSecuenciaSiConsta(sequence, invoiceRecordDb.ecfType);

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
  // Admite `null`: ver `PdfGenerator.generateQrBase64`.
  let qrBase64: string | null = '';
  if (firma.qr) {
    qrBase64 = firma.qr.startsWith('http')
      ? await PdfGenerator.generateQrBase64(firma.qr)
      : firma.qr;
  } else {
    // Lote 156: sin QR guardado se le pide a mSeller, que es quien lo emite
    // (ver services/dgii/qrDelComprobante.ts). Antes se armaba a mano un
    // enlace de la DGII que responde 404. Si mSeller no lo tiene, se imprime
    // sin QR.
    const enlace = await qrDelComprobante({
      invoiceId: invoiceRecordDb.id,
      companyId: invoiceRecordDb.companyId,
      modo: invoiceRecordDb.modo,
      ncf: invoiceRecordDb.ncf,
    });
    if (enlace) qrBase64 = await PdfGenerator.generateQrBase64(enlace);
  }

  if (qrBase64 === null) {
    // Esto se puede volver a pedir, y el fallo se ve mirando el PDF: basta con
    // que el log diga de que comprobante hablaba.
    qrBase64 = '';
    Logger.warn('[invoices/print] el comprobante se imprime SIN codigo QR', {
      invoiceId: invoiceRecordDb.id, ncf: invoiceRecordDb.ncf,
    });
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

/**
 * CUANTO PUEDE DURAR ESTA FUNCION.
 *
 * Sin declararlo, la plataforma aplica su valor por defecto -- del orden de 10
 * o 15 segundos -- y este PDF lo dibuja un Chromium que, en frio, tarda varios
 * segundos solo en arrancar. Cuando la plataforma corta antes, el cliente no ve
 * un error de impresion: ve que no pasa nada.
 *
 * Es la misma leccion que `services/dgii/tiempos.ts` dejo escrita para la
 * emision: subir un plazo por dentro no sirve de nada si la funcion se corta
 * por fuera. Los dos numeros tienen que ir juntos.
 */
export const maxDuration = 60;

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
  } catch (error: unknown) {
    console.error('Error printing invoice GET:', error);
    return new NextResponse(`Error al generar vista de impresión: ${(error as Error).message}`, {
      status: (error as Error).message === 'Invoice not found' ? 404 : 500
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

  } catch (error: unknown) {
    console.error('Error printing invoice POST:', error);
    return NextResponse.json({ error: `Internal server error: ${(error as Error).message}` }, { status: 500 });
  }
}
