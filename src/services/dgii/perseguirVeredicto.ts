import { db, invoices } from '@/db';
import { and, eq } from 'drizzle-orm';
import { Logger } from '@/utils/logger';
import { sincronizarPendientes } from './sincronizarPendientes';
import type { Modo } from '@/repositories/dgiiSubmissionRepository';
import { ESCALERA_MS, huecoDelIntento } from './escalera';

/**
 * Perseguir el veredicto de una factura recien emitida.
 *
 * EL PROBLEMA
 * -----------
 * mSeller devuelve la firma EN EL ACTO -- codigo de seguridad y QR -- pero el
 * veredicto de la DGII llega despues. Medido sobre los envios reales: las 30
 * ultimas filas traen todas `securityCode` y `qr_url`, y aun asi la factura
 * queda en 'submitted' hasta que alguien pregunta.
 *
 * O sea que la factura se puede IMPRIMIR ya -- la representacion impresa solo
 * necesita la firma y el QR, y los tiene -- pero se quedaba en "Enviado" en la
 * pantalla hasta que un humano pulsaba sincronizar. En caja, con gente
 * esperando, eso es una tarea manual por venta.
 *
 * Y el barrido automatico no lo resolvia porque NADIE LO LLAMA: el cron es una
 * ruta que espera que algo de fuera la despierte, y en esta instalacion no hay
 * quien lo haga.
 *
 * LA ESCALERA
 * -----------
 * Preguntar una sola vez no sirve: a veces el veredicto tarda dos segundos y a
 * veces diez minutos. Y preguntar en bucle cada segundo es castigar a mSeller
 * por cada venta. Se pregunta con los huecos creciendo:
 *
 *     2s · 4s · 8s · 15s · 30s · 60s · 120s · 300s
 *
 * Ocho intentos repartidos en algo mas de ocho minutos, concentrados al
 * principio, que es donde se resuelve la mayoria. Lo que no caiga ahi se queda
 * para el barrido de siempre: esto NO sustituye al cron, le quita el trabajo
 * urgente.
 *
 * Los numeros viven en `escalera.ts`, aparte: son una politica, y separados de
 * este mecanismo se pueden comprobar sin levantar base de datos ni cola.
 *
 * LO QUE ESTO **NO** HACE
 * -----------------------
 * No reenvia NADA. Solo consulta. Reenviar un comprobante que la DGII pudo
 * haber aceptado es duplicar un documento fiscal, y en este proyecto ya paso
 * una vez por dar un envio por no llegado.
 *
 * Por eso tampoco va en la cola `dgii-submissions`: el worker de esa cola
 * ignora el nombre del trabajo y SIEMPRE llama a `processDgiiSubmissionJob`,
 * que emite. Un trabajo de consulta encolado ahi habria reemitido la factura
 * ocho veces. Tiene su propia cola, `dgii-estado`, a proposito.
 */

export interface PeticionDePersecucion {
  companyId: string;
  invoiceId: string;
  modo: Modo;
  /** Cual de los peldaños de la escalera toca. Empieza en 0. */
  intento: number;
}

/**
 * Encola el siguiente intento, si queda alguno.
 *
 * Devuelve el hueco usado, o `null` si la escalera se acabo.
 */
export async function encolarSiguienteIntento(
  peticion: PeticionDePersecucion
): Promise<number | null> {
  const hueco = huecoDelIntento(peticion.intento);
  if (hueco == null) return null;

  //  La cola se importa aqui dentro y no arriba: `queue.ts` construye
  //  conexiones a Redis al cargarse, y este modulo lo usan caminos que no
  //  siempre quieren eso. Es el mismo patron que ya usa `invoiceDbBooker`.
  const { addJob } = await import('@/infrastructure/queue');
  await addJob(
    'dgii-estado',
    'perseguir-veredicto',
    { ...peticion },
    {
      delay: hueco,
      //  UN intento por trabajo. Los reintentos de BullMQ son para ERRORES, y
      //  "la DGII todavia no ha contestado" no es un error: si se usaran para
      //  esperar, un fallo de red y una espera normal quedarian indistinguibles
      //  en la cola. Cada intento encola el siguiente por su cuenta.
      attempts: 1,
    }
  );
  return hueco;
}

/**
 * Un peldaño: pregunta por esta factura y, si sigue sin veredicto, encola el
 * siguiente.
 */
export async function perseguirVeredicto(peticion: PeticionDePersecucion): Promise<{
  resuelta: boolean;
  estado: string | null;
  siguienteEn: number | null;
}> {
  const { companyId, invoiceId, modo, intento } = peticion;

  //  Antes de molestar a mSeller: ¿sigue esta factura esperando? Puede haberla
  //  resuelto el barrido, la consulta manual, o el peldaño anterior si dos se
  //  solaparon. `sincronizarPendientes` tambien filtra por 'submitted', pero
  //  mirarlo aqui evita cargar credenciales y abrir un cliente para nada.
  const [factura] = await db
    .select({ estado: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);

  if (!factura) {
    Logger.warn('[perseguirVeredicto] la factura ya no esta', { invoiceId, companyId });
    return { resuelta: true, estado: null, siguienteEn: null };
  }

  if (factura.estado !== 'submitted') {
    Logger.info('[perseguirVeredicto] ya tiene veredicto, no hay nada que perseguir', {
      invoiceId, estado: factura.estado, intento,
    });
    return { resuelta: true, estado: factura.estado, siguienteEn: null };
  }

  //  La consulta y la escritura del veredicto son las de siempre, acotadas a
  //  esta factura. Ver el comentario de `FiltroSincronizacion`: aqui NO se
  //  reescribe esa logica.
  await sincronizarPendientes({ companyId, modo, invoiceId });

  const [despues] = await db
    .select({ estado: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);

  const estado = despues?.estado ?? null;

  if (estado && estado !== 'submitted') {
    Logger.info('[perseguirVeredicto] veredicto recibido', {
      invoiceId, estado, intento, huecos: ESCALERA_MS.slice(0, intento + 1),
    });
    return { resuelta: true, estado, siguienteEn: null };
  }

  const siguienteEn = await encolarSiguienteIntento({ ...peticion, intento: intento + 1 });

  if (siguienteEn == null) {
    //  Se acabo la escalera. NO es un fallo y no se marca nada: la factura
    //  sigue siendo un 'submitted' legitimo y el barrido de siempre la
    //  recogera. Se deja dicho en el registro para que, si esto pasa a menudo,
    //  se vea que la escalera se queda corta.
    Logger.warn('[perseguirVeredicto] se agoto la escalera sin veredicto; queda para el barrido', {
      invoiceId, companyId, modo, intentos: ESCALERA_MS.length,
    });
  }

  return { resuelta: false, estado, siguienteEn };
}

/** El primer peldaño, el que se encola justo despues de emitir. */
export async function empezarAPerseguir(
  datos: Omit<PeticionDePersecucion, 'intento'>
): Promise<number | null> {
  return encolarSiguienteIntento({ ...datos, intento: 0 });
}
