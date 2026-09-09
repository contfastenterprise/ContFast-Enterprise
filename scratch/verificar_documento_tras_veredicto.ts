import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

/**
 * El fichero tal cual, o `null` si no existe.
 *
 * Aqui se comprueba tambien un fichero NUEVO, asi que "no existe" tiene que ser
 * un resultado y no una excepcion: en la contraprueba contra HEAD ese fichero no
 * estaba, y lo que se quiere ver es que las comprobaciones FALLAN, no que el
 * banco reviente antes de llegar.
 */
const crudo = (rutaRelativa: string): string | null => {
  const p = join(RAIZ, rutaRelativa);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

/** Sin las lineas de comentario: los comentarios citan lo que se quito. */
const sinComentarios = (t: string): string =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ El documento de la factura se produce cuando la DGII ACEPTA ═══════
//
// La DGII no acepta en el momento del envio: mSeller recibe el comprobante y la
// DGII resuelve despues. Al emitir, por tanto, la factura NO tiene todavia
// codigo de seguridad ni fecha de firma -- los dos los produce la DGII al
// firmar. Aun asi se generaba el PDF alli mismo y se mandaba por correo al
// cliente: un comprobante sin QR, con una "fecha de firma" que era en realidad
// la hora de imprimir, y guardado como si fuera el definitivo. Ese correo ya no
// se recoge.
//
// Ahora el documento sale con la aceptacion, y solo con ella. Rechazada no
// imprime: un comprobante que la DGII no acepto no es un comprobante, y un PDF
// suyo solo sirve para que alguien lo confunda con uno valido.

// ─────────── 1) La emision no genera nada sin aceptacion ───────────
let s = crudo('src/services/invoice/invoiceFileGenerator.ts')!;
ok(
  'emision: sin aceptacion no se genera PDF ni correo',
  s.includes("if (submission.finalStatus !== 'accepted') {") && s.includes('SIN VEREDICTO NO HAY DOCUMENTO.')
);
ok(
  'emision: rechazada tampoco imprime',
  !s.includes("submission.finalStatus !== 'rejected'") && s.includes('Rechazada no imprime')
);
ok(
  'emision: la fecha de firma tampoco se inventa',
  s.includes('signatureDate: submission.signatureDate || null,') &&
    !s.includes('signatureDate: new Date().toISOString(),')
);
ok('emision: la nota remite al camino nuevo', s.includes('services/invoice/correoFactura.ts'));

// ─────────── 2) La fecha de firma viaja desde el envio ───────────
s = crudo('src/services/invoice/types.ts')!;
ok('types: DgiiSubmissionResult lleva la fecha de firma', s.includes('signatureDate: string | null;'));

s = crudo('src/services/invoice/invoiceSubmissionService.ts')!;
ok(
  'submissionService: la saca con la misma lectura que todo lo demas',
  s.includes('const firma = camposDeFirma(msellerResponsePayload);') &&
    s.includes('signatureDate: firma.signatureDate ?? null,')
);

// ─────────── 3) El servicio compartido ───────────
const serv = crudo('src/services/invoice/correoFactura.ts');
ok('correoFactura: existe el servicio', serv !== null);
if (serv) {
  ok(
    'correoFactura: separa generar el PDF de mandar el correo',
    serv.includes('export async function regenerarPdfFactura(') &&
      serv.includes('export async function enviarFacturaPorCorreo(')
  );
  ok('correoFactura: el envio automatico exige factura aceptada', serv.includes("if (invoice.status !== 'accepted') {"));
  ok(
    'correoFactura: la marca se toma con IS NULL dentro del UPDATE (sin carrera)',
    serv.includes('isNull(invoices.customerEmailSentAt),') && serv.includes('.returning({ id: invoices.id });')
  );
  ok('correoFactura: si otra via llego antes, no se manda', serv.includes("motivo: 'ya_enviado'"));
  ok('correoFactura: el reenvio manual no exige aceptada ni toca la marca', serv.includes('if (!esReenvio) {'));
  ok(
    'correoFactura: el PDF se guarda en Supabase, no en disco local',
    serv.includes("await StorageService.uploadFile(pdfBucket, pdfFile, pdfBuffer, 'application/pdf');") &&
      !sinComentarios(serv).includes('fs.writeFileSync')
  );
  ok('correoFactura: la nota explica por que el disco local no servia', serv.includes('disco es efimero'));
  // Una sola copia del armado del PDF: el envio del correo lo pide, no lo repite.
  ok(
    'correoFactura: el bloque del PDF no esta duplicado',
    sinComentarios(serv).split('PdfGenerator.generatePdfFromHtml').length - 1 === 1 &&
      serv.includes('await regenerarPdfFactura({ invoiceId, companyId, modo });')
  );
  // El bloque venia de la ruta y arrastraba dos nombres que aqui no existen.
  ok(
    'correoFactura: no quedan referencias al parametro `id` de la ruta',
    !serv.includes('eq(invoiceLines.invoiceId, id)') &&
      !serv.includes('eq(invoiceTaxes.invoiceId, id)') &&
      !serv.includes('envioVigente(id,')
  );
  ok(
    'correoFactura: la generacion del PDF busca ella misma el cliente',
    serv.includes('? await CustomerRepository.findById(invoice.customerId, companyId)')
  );
  // El PDF es el comprobante, no el acuse del correo: sin correo tambien sale.
  ok(
    'correoFactura: se imprime antes de mirar si el cliente tiene correo',
    serv.indexOf('await regenerarPdfFactura({ invoiceId, companyId, modo });') < serv.indexOf("motivo: 'sin_cliente'")
  );
} else {
  for (let i = 0; i < 11; i++) ok('correoFactura: (no existe)', false);
}

// ─────────── 4) La ruta de reenvio queda como envoltorio ───────────
s = crudo('src/app/api/v1/invoices/[id]/email/route.ts')!;
ok(
  'ruta de reenvio: delega en el servicio',
  s.includes("import { enviarFacturaPorCorreo } from '@/services/invoice/correoFactura';") &&
    s.includes('esReenvio: true,')
);
ok('ruta de reenvio: ya no arma el PDF ella misma', !s.includes('generatePdfFromHtml'));

// ─────────── 5) Los dos caminos de sincronizacion ───────────
s = crudo('src/app/api/v1/ecf/[id]/dgii-status/route.ts')!;
ok(
  'dgii-status: detecta la transicion, no el estado',
  s.includes("acabaDeAceptarse = invoice.status !== 'accepted' && newStatus === 'accepted';")
);
ok('dgii-status: al aceptar manda el correo', s.includes('await enviarFacturaPorCorreo({') && s.includes('esReenvio: false,'));
ok(
  'dgii-status: al rechazar no se genera ni se manda nada',
  !s.includes('regenerarPdfFactura') && !s.includes('acabaDeRechazarse') && s.includes('acabaDeAceptarse')
);
ok(
  'dgii-status: un fallo del correo no convierte en error una consulta que fue bien',
  s.includes('no se pudo enviar el correo de la factura aceptada')
);

s = crudo('src/services/dgii/sincronizarPendientes.ts')!;
ok('sincronizarPendientes: al aceptar manda el correo', s.includes('await enviarFacturaPorCorreo({'));
ok(
  'sincronizarPendientes: al rechazar no se genera ni se manda nada',
  !s.includes('regenerarPdfFactura') && s.includes('un comprobante que la DGII no')
);
ok(
  'sincronizarPendientes: un correo fallido no para las demas facturas',
  s.includes('puede parar la sincronizacion de las demas facturas')
);

// ─────────── 6) La guarda de la firma sigue al codigo ───────────
// El bloque que resuelve la firma se movio de la ruta de correo al servicio. La
// guarda de DB-23 enumera los sitios donde vive ese bloque: si se queda
// apuntando a la ruta, vigila un fichero que ya no tiene nada que vigilar.
s = crudo('src/tests/firmaComprobante.vitest.ts')!;
ok(
  'guarda de firma: vigila el servicio, no la ruta que quedo vacia',
  s.includes("['src/services/invoice/correoFactura.ts', 'invoice'],") &&
    !s.includes("['src/app/api/v1/invoices/[id]/email/route.ts', 'invoice'],")
);

// ─────────── 7) La marca, en el esquema ───────────
s = crudo('src/db/schema/invoices.ts')!;
ok(
  'esquema: la factura guarda cuando se mando el correo',
  s.includes("customerEmailSentAt: timestamp('customer_email_sent_at'),")
);
ok('esquema: la nota explica la idempotencia', s.includes('gana una sola y el cliente recibe un correo, no dos'));

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
