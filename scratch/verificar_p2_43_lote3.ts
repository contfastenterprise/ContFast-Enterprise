/**
 * P2-43 lote 3: el comprobante que sale sin su codigo QR y nadie lo dice.
 *
 * EL FALLO
 * --------
 * `PdfGenerator.generateQrBase64` devolvia CADENA VACIA cuando no podia generar
 * el QR. Y la cadena vacia ya significaba otra cosa en los cuatro sitios que la
 * usan: "aqui no hay QR que poner" -- un caso legitimo y comentado, cuando el
 * comprobante no tiene codigo de seguridad y construir la consulta de la DGII
 * llevaria a preguntar por un codigo inexistente.
 *
 * Asi que "no habia nada que codificar" y "no se pudo codificar" acababan
 * siendo el mismo valor, y el e-CF se imprimia y se enviaba al cliente SIN su
 * codigo QR de consulta -- contenido obligatorio de la representacion impresa
 * -- sin que nada lo dijera. Un `console.error` en el servidor y a otra cosa.
 *
 * EL ARREGLO
 * ----------
 * La funcion devuelve `string | null`. `null` no se confunde con nada, y cada
 * sitio lo atiende como le corresponde: al emitir, un aviso en pantalla por el
 * canal de P2-30 y traza durable; al mandar el correo, traza durable, porque el
 * cliente ya recibio el documento incompleto; al reimprimir o descargar, aviso
 * en el log con el NCF, que se puede volver a pedir.
 *
 * Las ramas que deciden QUE codificar NO se tocan -- estan pensadas y
 * comentadas. Lo unico que cambia es el tipo del acumulador y una comprobacion
 * detras: reescribir la logica fiscal para arreglar un log habria sido el
 * arreglo equivocado.
 *
 * Contra el HEAD anterior: las 8 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo } from './_fuente';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const crudo = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const FILE = 'src/services/invoice/invoiceFileGenerator.ts';
const CORR = 'src/services/invoice/correoFactura.ts';
const PRINT = 'src/app/api/v1/invoices/[id]/print/route.ts';
const PDF = 'src/app/api/v1/invoices/[id]/pdf/route.ts';

// ─── la funcion ─────────────────────────────────────────────────────────
{
  const src = fuente('src/services/print/pdfGenerator.ts');
  ok('el QR: `null` es "no se pudo", y ya no se confunde con "no habia"',
    src.includes('static async generateQrBase64(url: string): Promise<string | null> {')
    && src.includes('return null;')
    && !src.includes("console.error('Error generating QR code:'")
    && src.includes("Logger.error('[PdfGenerator] no se pudo generar el codigo QR'"));
}

// ─── los cuatro sitios ──────────────────────────────────────────────────
{
  const cuatro = [FILE, CORR, PRINT, PDF].map(fuente);
  ok('los CUATRO sitios que arman el comprobante distinguen el fallo',
    cuatro.every((s) => s.includes("let qrBase64: string | null = '';")));

  // Esta es la que protege el arreglo de si mismo: las ramas que deciden QUE
  // codificar estan pensadas y comentadas, y no se han tocado.
  ok('y las ramas que deciden QUE codificar siguen intactas',
    [CORR, PRINT, PDF].every((p) =>
      crudo(p).includes('un QR que lleva a la DGII a')
      && fuente(p).includes("let qrBase64: string | null = '';"))
    && crudo(FILE).includes('salia un QR con `codigoSeguridad=` vacio'));
}

// ─── al emitir ──────────────────────────────────────────────────────────
{
  const src = fuente(FILE);
  ok('al EMITIR: avisa a quien acaba de facturar y deja traza',
    src.includes('if (qrBase64 === null) {')
    && src.includes("await this.registrarFalloPostEmision(data, null, ncf, 'codigo_qr', new Error('QRCode.toDataURL fallo'));")
    && src.includes('El comprobante se generó SIN el código QR de consulta.'));
}

// ─── al enviar el correo ────────────────────────────────────────────────
{
  const src = fuente(CORR);
  ok('al ENVIAR EL CORREO: queda constancia de cual factura salio incompleta',
    src.includes('if (qrBase64 === null) {')
    && src.includes("paso: 'codigo_qr',")
    && src.includes("donde: 'correo al cliente'")
    && src.includes("Logger.warn('[correoFactura] el comprobante sale SIN codigo QR'"));
}

// ─── al reimprimir y al descargar ───────────────────────────────────────
{
  const p = fuente(PRINT);
  const d = fuente(PDF);
  ok('al REIMPRIMIR y al DESCARGAR: el log dice de que comprobante hablaba',
    p.includes("Logger.warn('[invoices/print] el comprobante se imprime SIN codigo QR'")
    && p.includes('invoiceId: invoiceRecordDb.id, ncf: invoiceRecordDb.ncf,')
    && d.includes("Logger.warn('[invoices/pdf] el comprobante se descarga SIN codigo QR'")
    && d.includes('invoiceId: invoice.id, ncf: invoice.ncf,'));
}

// ─── de paso ────────────────────────────────────────────────────────────
{
  const s = fuente('src/services/storageService.ts');
  // Era un ERROR lo que muchas veces no lo es: la clave anonima de Supabase no
  // siempre puede listar buckets aunque la subida funcione. Un log de averia
  // que salta cuando no hay averia entrena a no mirar los logs.
  ok('el bucket que no se puede listar deja de parecer una averia',
    !s.includes('Logger.error(`[StorageService] Error ensuring bucket')
    && s.includes('no se pudo asegurar el bucket ${bucketName}; se intenta subir igual'));

  const d = fuente('src/services/documents/documentService.ts');
  ok('la ruta que devuelve el PDF no promete que el fichero este guardado',
    !d.includes("console.error('[DocumentService] Failed to save PDF to storage:'")
    && d.includes('el PDF no se pudo guardar en almacenamiento; se devuelve generado')
    && crudo('src/services/documents/documentService.ts').includes('es donde ESTARIA, no la prueba de que'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
