/**
 * El documento definitivo de la factura: el PDF y el correo al cliente.
 *
 * POR QUE ESTO NO PASA AL EMITIR
 * ------------------------------
 * La DGII no acepta en el momento del envio. Al emitir, la factura no tiene
 * todavia codigo de seguridad ni fecha de firma: son datos que produce la DGII al
 * firmar. Un PDF generado antes sale sin QR y sin esos dos campos, y si ademas se
 * manda por correo, ese correo ya no se recoge.
 *
 * Por eso la emision ya no genera PDF ni manda correo cuando la factura queda
 * pendiente. El documento se produce cuando hay veredicto:
 *
 *   - ACEPTADA  -> se genera el PDF (con codigo y fecha reales) y se manda al
 *                  cliente.
 *   - RECHAZADA -> no se imprime nada. Un comprobante que la DGII no acepto no
 *                  es un comprobante, y un PDF suyo solo sirve para que alguien
 *                  lo confunda con uno valido. El rechazo se ve en la pantalla,
 *                  con su motivo.
 *
 * El armado del PDF y el del correo son el MISMO codigo que usaba el boton de
 * reenviar: se movieron desde la ruta, no se reescribieron.
 *
 * IDEMPOTENCIA DEL CORREO
 * -----------------------
 * Hay dos vias de sincronizacion (la consulta de una factura y el barrido de
 * pendientes) y las dos pueden ver la misma transicion a aceptada.
 * `customer_email_sent_at` se toma con la condicion `IS NULL` en el propio
 * UPDATE: gana una sola y el cliente recibe un correo, no dos. No se
 * comprueba-y-luego-escribe, que es justo la carrera que dejaria mandar dos.
 */
import { Logger } from '@/utils/logger';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { CustomerRepository } from '@/repositories/customerRepository';
import { addJob } from '@/infrastructure/queue';
import { CompanyRepository } from '@/repositories/companyRepository';
import { db, invoiceLines, invoiceTaxes, products, ecfSequences, invoices } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { envioVigente, firmaDelComprobante } from '@/repositories/dgiiSubmissionRepository';
import { urlConsultaDgii } from '@/services/dgii/codigoSeguridad';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { registrarFalloSilencioso } from '@/services/auditoria/rastroDeFallo';

export type Modo = 'PRODUCCION' | 'PRUEBA';

/** Por que NO se envio, cuando no se envia. Ninguno es un error del sistema. */
export type MotivoNoEnviado =
  | 'factura_no_encontrada'
  | 'sin_cliente'
  | 'cliente_no_existe'
  | 'sin_correo'
  | 'sin_empresa'
  | 'no_aceptada'
  | 'ya_enviado';

export type ResultadoCorreoFactura =
  | { enviado: true; correo: string }
  | { enviado: false; motivo: MotivoNoEnviado; mensaje: string };

/**
 * Regenera el PDF de la factura y lo deja en su ruta.
 *
 * Solo se imprime lo ACEPTADO: quien llama a esto ya ha comprobado el veredicto.
 * Lee la firma de la factura, asi que lo que imprime es lo que consta -- si no
 * consta, no lo pinta.
 *
 * Es la UNICA copia del armado del PDF. `enviarFacturaPorCorreo` tenia otra
 * identica de doscientas lineas, que es como se arreglan dos veces las cosas que
 * se arreglan una.
 */
export async function regenerarPdfFactura(opciones: {
  invoiceId: string;
  companyId: string;
  modo: Modo;
}): Promise<boolean> {
  const { invoiceId, companyId, modo } = opciones;

  const invoice = await InvoiceRepository.getById(invoiceId, companyId, modo);
  if (!invoice) return false;

  const company = await CompanyRepository.getProfile(companyId);
  if (!company) return false;

  // El comprobante lleva los datos del cliente. Si la factura no tiene cliente
  // asociado, la plantilla ya cae a `buyerName`/`buyerRnc`: por eso esto no es
  // motivo para no imprimir.
  const customer = invoice.customerId
    ? await CustomerRepository.findById(invoice.customerId, companyId)
    : null;

  // Always regenerate PDF before sending to ensure it contains the correct SKUs
  let pdfPath = invoice.pdfPath;
  if (pdfPath) {
    try {
      const settings = await CompanyRepository.getSettings(companyId);
      
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
            eq(ecfSequences.companyId, companyId),
            eq(ecfSequences.modo, modo),
            eq(ecfSequences.ecfType, invoice.ecfType)
          )
        )
        .limit(1);

      // Era `: '31-12-2027'`. Una fecha de vencimiento inventada, impresa en el
// comprobante del cliente bajo el rotulo "Fecha Vencimiento". Sin fecha no se
// imprime la linea: la plantilla ya la omite cuando esto es null.
const ncfExpiry = sequence?.sequenceExpiry
  || (sequence?.expiryDate ? new Date(sequence.expiryDate).toLocaleDateString('es-DO').replace(/\//g, '-') : null);

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
        .where(eq(invoiceLines.invoiceId, invoiceId));

      // Fetch taxes
      const taxes = await db
        .select()
        .from(invoiceTaxes)
        .where(eq(invoiceTaxes.invoiceId, invoiceId));

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
      const firma = firmaDelComprobante(invoice, submission);
      const securityCode = firma.codigo;
      const signedDate = firma.fechaFirma;
      // Admite `null` para poder distinguir "no se pudo generar" de "no habia
      // QR que poner". Ver `PdfGenerator.generateQrBase64`.
      let qrBase64: string | null = '';
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

      if (qrBase64 === null) {
        // Aqui el documento se le manda AL CLIENTE. Si sale sin QR, ya no hay
        // forma de retirarlo: tiene que quedar constancia de cual fue.
        qrBase64 = '';
        Logger.warn('[correoFactura] el comprobante sale SIN codigo QR', {
          invoiceId, ncf: invoice.ncf,
        });
        await registrarFalloSilencioso({
          companyId,
          modo,
          paso: 'codigo_qr',
          entityType: 'invoices',
          entityId: invoiceId,
          contexto: { ncf: invoice.ncf, donde: 'correo al cliente' },
          err: new Error('QRCode.toDataURL fallo'),
        });
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
        //  EL ESTADO, no solo el codigo. mSeller devuelve `securityCode` AUNQUE la
        //  DGII rechace -- comprobado: E440000000001 volvio 'rejected' con codigo
        //  JW0T3M. Condicionar la leyenda de firma a que exista codigo haria que un
        //  comprobante RECHAZADO se imprimiera como firmado valido.
        estadoFiscal: invoice.status,
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
        retentions: (invoice.retentions || []).map((r) => ({
          retentionId: r.retentionId || undefined,
          retentionName: r.retentionName,
          retentionType: r.retentionType,
          retentionPercentage: Number(r.retentionPercentage),
          retentionAmount: Number(r.retentionAmount)
        })),
        company: company ? {
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
      
      // El PDF vive en Supabase Storage: es de donde lo baja el trabajo de correo
      // para adjuntarlo, y lo que sobrevive a un despliegue.
      //
      // Aqui se escribia con fs.writeFileSync en el disco local. En serverless ese
      // disco es efimero y ademas de OTRA invocacion, asi que el trabajo de correo
      // no encontraba el fichero y caia a su respaldo: bajar de Supabase el PDF
      // ANTERIOR. Regenerar no servia de nada. La emision si subia a Supabase.
      const { StorageService } = await import('@/services/storageService');
      const { bucketName: pdfBucket, filePath: pdfFile } = StorageService.parseDbPath(pdfPath);
      await StorageService.uploadFile(pdfBucket, pdfFile, pdfBuffer, 'application/pdf');
      Logger.info(`[correoFactura] PDF regenerado y subido a ${pdfPath}`);
    } catch (err: unknown) {
      Logger.error('[correoFactura] no se pudo regenerar el PDF', err);
    }
  }

  return true;
}

/**
 * Manda al cliente el correo con la factura, regenerando antes su PDF.
 *
 * `esReenvio` distingue los dos disparadores: el boton de la pantalla, que lo
 * pide una persona y manda siempre; y la sincronizacion, que exige factura
 * aceptada y marca el envio para no repetirlo.
 */
export async function enviarFacturaPorCorreo(opciones: {
  invoiceId: string;
  companyId: string;
  modo: Modo;
  esReenvio: boolean;
}): Promise<ResultadoCorreoFactura> {
  const { invoiceId, companyId, modo, esReenvio } = opciones;

  const invoice = await InvoiceRepository.getById(invoiceId, companyId, modo);
  if (!invoice) {
    return { enviado: false, motivo: 'factura_no_encontrada', mensaje: 'Factura no encontrada.' };
  }

  if (!esReenvio) {
    // El envio automatico solo procede con veredicto favorable.
    if (invoice.status !== 'accepted') {
      return { enviado: false, motivo: 'no_aceptada', mensaje: 'La DGII todavía no ha aceptado el comprobante.' };
    }

    // La marca se toma con `IS NULL` dentro del UPDATE. Si otra via llego antes,
    // esto no actualiza ninguna fila y aqui se para.
    const tomada = await db
      .update(invoices)
      .set({ customerEmailSentAt: new Date() })
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.companyId, companyId),
        isNull(invoices.customerEmailSentAt),
      ))
      .returning({ id: invoices.id });

    if (tomada.length === 0) {
      return { enviado: false, motivo: 'ya_enviado', mensaje: 'El correo de esta factura ya se había enviado.' };
    }
  }

  // El documento se imprime SIEMPRE que la DGII acepta, tenga el cliente correo
  // o no: el PDF es el comprobante fiscal, no el acuse de un envio. Por eso va
  // aqui y no mas abajo -- lo que decide el cliente es si ademas hay correo que
  // mandar, no si existe el documento.
  await regenerarPdfFactura({ invoiceId, companyId, modo });
  const pdfPath = invoice.pdfPath;

  if (!invoice.customerId) {
    return { enviado: false, motivo: 'sin_cliente', mensaje: 'La factura no tiene un cliente asociado.' };
  }

  const customer = await CustomerRepository.findById(invoice.customerId, companyId);
  if (!customer) {
    return { enviado: false, motivo: 'cliente_no_existe', mensaje: 'El cliente asociado no existe o fue eliminado.' };
  }
  if (!customer.email) {
    return { enviado: false, motivo: 'sin_correo', mensaje: 'El cliente no tiene un correo electrónico registrado.' };
  }

  const company = await CompanyRepository.getProfile(companyId);
  // Un correo a un CLIENTE firmado por una empresa inventada ('ContFast', que
  // ademas es el nombre del producto) no se envia. `companies.name` es NOT NULL:
  // si esto falta, es que la busqueda fallo.
  if (!company) {
    return { enviado: false, motivo: 'sin_empresa', mensaje: 'No se encontró la empresa emisora. No se envía el correo.' };
  }
  const companyName = company.name;

  let docName = 'Factura';
  let typeStr = invoice.paymentType === 'credit' ? ' a crédito' : '';
  if (invoice.ecfType === '33') {
    docName = 'Nota de Débito';
    typeStr = '';
  } else if (invoice.ecfType === '34') {
    docName = 'Nota de Crédito';
    typeStr = '';
  }

  const frase = esReenvio ? 'Le reenviamos su' : 'Le notificamos la emisión de su';
  const subject = esReenvio
    ? `Reenvío de ${docName}${typeStr} - NCF: ${invoice.ncf}`
    : `${docName}${typeStr} - NCF: ${invoice.ncf}`;

  // Queue resending the email
  await addJob('emails-sending', 'send-email', {
    to: customer.email,
    subject,
    text: `Estimado(a) ${customer.name},\n\n${frase} ${docName.toLowerCase()}${typeStr} NCF: ${invoice.ncf} por un valor total de RD$ ${invoice.total}.\n\nAtentamente,\n${companyName}`,
    html: `<p>Estimado(a) <strong>${customer.name}</strong>,</p><p>${frase} ${docName.toLowerCase()}${typeStr} NCF: <strong>${invoice.ncf}</strong> por un valor total de <strong>RD$ ${invoice.total}</strong>.</p><p>Atentamente,<br/>${companyName}</p>`,
    pdfPath: pdfPath || undefined,
  });

  return { enviado: true, correo: customer.email };
}
