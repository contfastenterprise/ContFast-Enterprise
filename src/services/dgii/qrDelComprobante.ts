/**
 * El QR impreso de un comprobante, cuando la factura no lo tiene guardado.
 *
 * POR QUE ESTE FICHERO (lote 156)
 * -------------------------------
 * mSeller devuelve `qr_url` al firmar, y ese es el QR que va en la
 * representacion impresa. Cuando faltaba, los cuatro sitios que imprimen
 * (impresion, PDF, generacion de archivos tras emitir y correo al cliente)
 * armaban a mano una direccion `https://ecf.dgii.gov.do/e-cf/Consulta?...` que
 * el portal responde con **404**: un comprobante fiscal con un QR que no
 * valida. Medido: hoy ninguna factura esta en ese caso (0 de 71), asi que es un
 * defecto latente, no un daño hecho.
 *
 * Decidido por el dueño el 2026-09-18: no se arma ningun enlace de la DGII; si
 * falta el QR se le pide A MSELLER, que es quien lo emite, y se guarda en la
 * factura para no volver a preguntar. Si mSeller tampoco lo tiene, se imprime
 * SIN QR: mejor sin QR que con uno que no valida.
 *
 * REGLA DE ESTE MODULO: nunca lanza. Imprimir no puede fallar porque mSeller
 * este caido o lento.
 */
import { and, eq } from 'drizzle-orm';
import { db, invoices } from '@/db';
import { companySettings } from '@/db';
import { isNull } from 'drizzle-orm';
import { MSellerClient } from './msellerClient';
import { credencialesMseller } from './credenciales';
import { baseUrlMseller } from './urlMseller';
import { entornoDgii } from './entorno';
import { leerDatosFirma } from './codigoSeguridad';
import type { ModoOperativo } from './modoPeticion';
import { Logger } from '@/utils/logger';

/**
 * Cuanto se espera a mSeller ANTES de imprimir sin QR.
 *
 * `MS_CONSULTA` son 15 s, que estan bien para la pantalla de "Consultar
 * estado", donde el usuario pidio justo eso. Aqui el usuario pidio un PDF: se
 * corta antes y se imprime sin QR, que es un resultado valido.
 */
export const MS_QR_IMPRESION = 6_000;

/**
 * El enlace del QR que trae una respuesta de mSeller, o cadena vacia.
 *
 * Solo cuenta si la consulta fue bien Y el enlace es una direccion: lo que se
 * imprime es un QR que alguien va a escanear. Un `qr` que no empieza por
 * `http` (un base64, un codigo suelto) no se usa aqui -- ese camino es el del
 * QR ya guardado, que si admite base64.
 */
export function qrDeLaRespuesta(respuesta: { success?: boolean; rawResponse?: unknown } | null): string {
  if (!respuesta?.success) return '';
  const qr = leerDatosFirma(respuesta.rawResponse ?? respuesta).qr;
  return qr.startsWith('http') ? qr : '';
}

interface Peticion {
  /**
   * La factura donde guardar el QR. Se omite en la emision: ahi el documento
   * se dibuja antes de que la factura exista, asi que se usa el enlace y no se
   * guarda (la consulta de estado lo guardara despues).
   */
  invoiceId?: string | null;
  companyId: string;
  modo: ModoOperativo;
  ncf?: string | null;
  /** Lo que ya consta (factura o envio). Si viene, no se pregunta nada. */
  qrGuardado?: string | null;
}

/** Corta la espera sin dejar la promesa colgando del resultado. */
export function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const reloj = setTimeout(() => resolve(null), ms);
    promesa.then(
      (v) => { clearTimeout(reloj); resolve(v); },
      () => { clearTimeout(reloj); resolve(null); }
    );
  });
}

/**
 * El enlace del QR: el guardado, o el que diga mSeller. Cadena vacia si no hay.
 *
 * El entorno sale del MODO de la factura, nunca de los ajustes de la empresa:
 * preguntar por una factura de PRUEBA no puede acabar consultando la cuenta
 * real (mismo criterio que la ruta de "Consultar estado").
 */
export async function qrDelComprobante(p: Peticion): Promise<string> {
  const guardado = (p.qrGuardado || '').trim();
  if (guardado) return guardado;
  if (!p.ncf) return '';

  try {
    const [ajustes] = await db
      .select({ msellerUrl: companySettings.msellerUrl })
      .from(companySettings)
      .where(and(eq(companySettings.companyId, p.companyId), isNull(companySettings.deletedAt)))
      .limit(1);

    const entorno = entornoDgii(p.modo);
    const credenciales = await credencialesMseller(p.companyId, entorno);
    const cliente = new MSellerClient({
      baseUrl: baseUrlMseller(ajustes?.msellerUrl),
      entorno,
      email: credenciales.email,
      password: credenciales.password,
      apiKeyEncrypted: credenciales.apiKeyEncrypted,
    });

    const qr = qrDeLaRespuesta(await conPlazo(cliente.getDocumentStatus(p.ncf), MS_QR_IMPRESION));
    if (!qr) return '';

    // Se guarda en la factura, que es donde nada lo pisa (misma columna que
    // escribe la consulta de estado, migraciones 0042/0043). Con empresa y
    // modo: el id llega de quien imprime.
    if (p.invoiceId) {
      await db
        .update(invoices)
        .set({ qrUrl: qr })
        .where(and(
          eq(invoices.id, p.invoiceId),
          eq(invoices.companyId, p.companyId),
          eq(invoices.modo, p.modo)
        ));
    }

    return qr;
  } catch (err: unknown) {
    Logger.warn('[qr] no se pudo obtener el QR de mSeller; se imprime sin el', {
      ncf: p.ncf,
      error: (err as Error)?.message,
    });
    return '';
  }
}
