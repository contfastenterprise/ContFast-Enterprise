import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '@/services/storageService';
import { Logger } from '@/utils/logger';

/**
 * LOS PDF TEMPORALES NO PUEDEN VIVIR EN EL DISCO DE LA INSTANCIA (lote 183)
 * -------------------------------------------------------------------------
 * Reportado por el dueño el 2026-09-22: al registrar un recibo de cobro, la
 * pantalla de impresion daba error. Encontrado en los logs de PRODUCCION:
 *
 *     201  POST /api/v1/ar/receipts                  <- el recibo se registra
 *     200  POST /api/v1/ar/receipts/{id}/print       <- el PDF se genera
 *     404  GET  /api/v1/documents/{uuid}/download    <- aqui
 *
 * 404 y no 403, asi que la firma era valida: el fichero simplemente NO ESTABA.
 *
 * DOS CAUSAS, las dos del mismo sitio:
 *
 *  1. El PDF se escribia en el disco LOCAL de la instancia (`os.tmpdir()`), y la
 *     descarga es una SEGUNDA peticion que Vercel enruta por su cuenta. Si cae
 *     en otra instancia -- o en la misma despues de reciclarse -- el fichero no
 *     existe. Es intermitente, que es lo peor: con poco trafico suele haber una
 *     sola instancia caliente y entonces acierta.
 *
 *  2. El fichero se BORRABA un segundo despues de la primera descarga. Los
 *     visores de PDF piden el fichero dos veces (la segunda con `Range`), y esa
 *     segunda vez daba 404. Recargar la pestaña, igual. El propio mensaje lo
 *     insinuaba: "File not found or already downloaded".
 *
 * NO ERA SOLO EL RECIBO: ocho rutas usan esto (ap, recibos, recibos por cliente,
 * estados de cuenta de clientes y suplidores, facturas, cotizaciones y tools).
 * Todas podian dar 404.
 *
 * LA CURA: el PDF va a un bucket que ve CUALQUIER instancia. Cambia solo este
 * modulo -- las ocho rutas siguen llamando a `saveTemporaryFile` igual -- porque
 * `StorageService` ya sabia subir, bajar, borrar y asegurar el bucket.
 *
 * Y DEJA DE BORRARSE AL DESCARGAR, que es la causa 2. En su lugar, al guardar
 * uno nuevo se barren los de mas de una hora. Se limpia solo y no depende del
 * cron de `reportQueue`, que necesita Redis -- retirado de Vercel el 2026-09-22
 * por cuota agotada.
 *
 * UN SOLO CAMINO EN DESARROLLO Y EN PRODUCCION, a proposito. Antes el disco
 * local funcionaba en un portatil y fallaba en Vercel: es exactamente la clase
 * de diferencia que el lote 174 dejo escrita como trampa.
 */

/** El bucket de los temporales. Privado: se sirven por URL firmada. */
export const BUCKET_TEMPORALES = 'documentos-temporales';

/** Cuanto vive un temporal antes de que el barrido se lo lleve. */
const VIDA_MS = 60 * 60 * 1000;
const URL_SIGNATURE_SECRET_ENV = process.env.URL_SIGNATURE_SECRET;
if (!URL_SIGNATURE_SECRET_ENV) {
  throw new Error('La variable de entorno URL_SIGNATURE_SECRET es obligatoria.');
}
const URL_SIGNATURE_SECRET: string = URL_SIGNATURE_SECRET_ENV;

export class DocumentService {
  /**
   * Generates a signed URL for temporary file access.
   * @param documentId The UUID of the document
   * @param expiresInMinutes Expiration time in minutes
   */
  static generateSignedUrl(documentId: string, expiresInMinutes: number = 10, filename?: string): string {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    
    // Create HMAC SHA256 of the documentId and expiresAt
    const hmac = crypto.createHmac('sha256', URL_SIGNATURE_SECRET);
    hmac.update(`${documentId}:${expiresAt}`);
    const signature = hmac.digest('hex');

    // The endpoint will be /api/v1/documents/[uuid]/download?expiresAt=...&signature=...
    let url = `/api/v1/documents/${documentId}/download?expiresAt=${expiresAt}&signature=${signature}`;
    if (filename) {
      url += `&filename=${encodeURIComponent(filename)}`;
    }
    return url;
  }

  /**
   * Validates a signed URL's parameters
   * @param documentId The UUID of the document
   * @param expiresAt The expiration timestamp
   * @param signature The provided HMAC signature
   * @returns true if valid, false if invalid or expired
   */
  static validateSignature(documentId: string, expiresAt: string, signature: string): boolean {
    const expiresAtNum = parseInt(expiresAt, 10);
    if (isNaN(expiresAtNum) || Date.now() > expiresAtNum) {
      return false; // Expired or invalid format
    }

    const hmac = crypto.createHmac('sha256', URL_SIGNATURE_SECRET);
    hmac.update(`${documentId}:${expiresAt}`);
    const expectedSignature = hmac.digest('hex');

    // Prevent timing attacks by comparing lengths first, then timingSafeEqual if same length
    if (expectedSignature.length !== signature.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  }

  /**
   * Guarda el PDF en el bucket y devuelve su identificador.
   *
   * La firma no cambia: las ocho rutas que la llaman siguen igual.
   */
  static async saveTemporaryFile(buffer: Buffer, extension: 'pdf' | 'xlsx'): Promise<string> {
    const documentId = uuidv4();
    const tipo = extension === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    await StorageService.uploadFile(BUCKET_TEMPORALES, `${documentId}.${extension}`, buffer, tipo);

    //  El barrido va DETRAS y sin esperarlo: quien imprime no tiene por que
    //  pagar la limpieza de lo que dejaron otros. Y nunca lanza.
    void this.barrerViejos();

    return documentId;
  }

  /**
   * Lee un temporal. `null` si no esta -- que es lo que responde 404.
   *
   * El identificador se limpia antes de usarlo: llega de la URL, y una barra o
   * un `..` dentro convertirian esto en una lectura de otra carpeta del bucket.
   */
  static async leerTemporal(documentId: string, extension: 'pdf' | 'xlsx'): Promise<Buffer | null> {
    const seguro = this.identificadorSeguro(documentId);
    if (!seguro) return null;
    try {
      return await StorageService.downloadFile(BUCKET_TEMPORALES, `${seguro}.${extension}`);
    } catch {
      //  Que no este es un caso NORMAL: el enlace caduca a los 10 minutos y el
      //  barrido se lleva lo de mas de una hora. No es un error que registrar.
      return null;
    }
  }

  /**
   * Solo lo que puede ser un UUID. Cualquier otra cosa se rechaza entera en vez
   * de intentar sanearla: un identificador que no lo es no apunta a nada nuestro.
   */
  private static identificadorSeguro(documentId: string): string | null {
    return /^[0-9a-fA-F-]{36}$/.test(documentId) ? documentId : null;
  }

  /**
   * Se lleva los temporales de mas de una hora.
   *
   * NUNCA LANZA: limpiar es de fondo, y si falla lo unico que pasa es que queda
   * un PDF de mas en el bucket. Tumbar una impresion por eso seria absurdo.
   */
  static async barrerViejos(): Promise<number> {
    try {
      const ahora = Date.now();
      const ficheros = await StorageService.listFiles(BUCKET_TEMPORALES);
      const viejos = ficheros.filter((f) => {
        if (!f.createdAt) return false; // sin fecha no se decide: no se borra
        const t = Date.parse(f.createdAt);
        return Number.isFinite(t) && ahora - t > VIDA_MS;
      });
      for (const f of viejos) {
        try { await StorageService.deleteFile(BUCKET_TEMPORALES, f.name); } catch { /* ya no estaba */ }
      }
      if (viejos.length > 0) {
        Logger.info('[documentos-temporales] barridos', { cuantos: viejos.length, de: ficheros.length });
      }
      return viejos.length;
    } catch (err: unknown) {
      Logger.warn('[documentos-temporales] no se pudo barrer', { motivo: (err as Error)?.message });
      return 0;
    }
  }
}
