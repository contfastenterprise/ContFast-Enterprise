import { Queue, Job } from 'bullmq';
import { redis } from './redis';
import { processDgiiSubmissionJob, sendEmailJob } from './jobRunners';
import type { ContextoCorreo } from '@/services/correo/registroCorreo';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.IS_BUILD === 'true';

// Define Queues
export const dgiiQueue = (redis && !isBuildPhase) ? new Queue('dgii-submissions', { connection: redis, skipVersionCheck: true }) : null;
export const emailQueue = (redis && !isBuildPhase) ? new Queue('emails-sending', { connection: redis, skipVersionCheck: true }) : null;

/**
 * Consultar el estado de un e-CF ya enviado. SOLO CONSULTA.
 *
 * Tiene cola propia y no comparte la de `dgii-submissions` por una razon que
 * no es de orden: el worker de aquella IGNORA el nombre del trabajo y siempre
 * llama a `processDgiiSubmissionJob`, que EMITE. Un trabajo de consulta
 * encolado ahi habria reemitido el comprobante una vez por intento.
 */
export const estadoQueue = (redis && !isBuildPhase) ? new Queue('dgii-estado', { connection: redis, skipVersionCheck: true }) : null;

if (dgiiQueue) dgiiQueue.on('error', err => console.error(`[Queue] dgii-submissions error: ${err.message}`));
if (emailQueue) emailQueue.on('error', err => console.error(`[Queue] emails-sending error: ${err.message}`));
if (estadoQueue) estadoQueue.on('error', err => console.error(`[Queue] dgii-estado error: ${err.message}`));

export interface JobPayloads {
  'dgii-submissions': {
    companyId: string;
    invoiceId: string;
    /**
     * El intento concreto que este trabajo debe actualizar. Opcional a
     * proposito: los trabajos que ya estaban en la cola cuando se desplego
     * esto no lo llevan, y jobRunners lo deduce para esos.
     */
    submissionId?: string;
  };
  'dgii-estado': {
    companyId: string;
    invoiceId: string;
    modo: string;
    /** Que peldaño de la escalera toca. Ver services/dgii/perseguirVeredicto.ts. */
    intento: number;
  };
  'emails-sending': {
    to: string;
    subject: string;
    text: string;
    html?: string;
    pdfPath?: string;
    /**
     * Lote 157: OBLIGATORIOS. Eran opcionales, y por eso los dos correos de
     * factura se encolaban sin ellos y `system_email_logs` llevaba 0 filas: sin
     * empresa no hay fila que insertar. Ver services/correo/registroCorreo.ts.
     */
    companyId: string;
    modo: string;
    /** De donde sale el correo: factura, orden_suplidor, sistema. */
    context: ContextoCorreo;
    /** El documento al que pertenece (id de la factura, de la orden...). */
    referenceId?: string;
    /** Quien lo pidio, cuando lo pidio una persona. */
    userId?: string;
    fromName?: string;
  };
}

/**
 * Triggers in-process fallback execution for queues when Redis is offline.
 */
async function triggerFallback<K extends keyof JobPayloads>(
  queueName: K,
  name: string,
  data: JobPayloads[K],
  delay = 0
): Promise<Job> {
  console.log(`[Queue Fallback] Redis is offline. Running job "${name}" of queue "${queueName}" in-process in ${delay}ms...`);

  //  EL RETRASO SE RESPETA.
  //
  //  Antes este camino ejecutaba siempre con `0`, tirando el `delay` que
  //  pidiera quien encolaba. Daba igual mientras el unico trabajo se encolaba
  //  sin retraso; deja de dar igual con la persecucion del veredicto, que ES
  //  una escalera de esperas: sin esto, los ocho intentos saldrian de golpe y
  //  a la vez, preguntando ocho veces por algo que aun no puede haber
  //  cambiado. Y en desarrollo, que es donde no suele haber Redis, seria el
  //  unico comportamiento que se ve.
  const ejecutar = async () => {
    try {
      if (queueName === 'emails-sending') {
        await sendEmailJob(data as any);
      } else if (queueName === 'dgii-submissions') {
        await processDgiiSubmissionJob(data as any);
      } else if (queueName === 'dgii-estado') {
        const { perseguirVeredicto } = await import('@/services/dgii/perseguirVeredicto');
        await perseguirVeredicto(data as any);
      } else {
        console.warn(`[Queue Fallback] Unknown queue: ${queueName}`);
      }
    } catch (err: any) {
      console.error(`[Queue Fallback] Job "${name}" in queue "${queueName}" failed:`, err.message);
    }
  };

  //  DENTRO DE UNA PETICION, CON `after()` (lote 219).
  //
  //  Desde que se retiro `REDIS_URL` (22/09) este es el camino NORMAL en
  //  produccion, no un respaldo: por aqui salen el correo al cliente y los
  //  peldaños de la persecucion del veredicto. Con un `setTimeout` suelto, la
  //  tarea corre solo si Vercel mantiene viva la instancia despues de
  //  responder, y eso la plataforma no lo promete -- es el mismo defecto que el
  //  `void` del lote 199. Medido el 2026-09-28: las 12 facturas de PRODUCCION
  //  desde el 15/09 tuvieron su veredicto en 6-119 s, asi que HOY funciona;
  //  esto lo pasa de "funciona en la practica" a garantizado. `after()` mantiene
  //  viva la funcion hasta que la tarea termina, dentro del `maxDuration` de la
  //  ruta, y se puede anidar (cada peldaño encola el siguiente desde dentro).
  //
  //  FUERA de una peticion -- guiones, bancos, el worker con Redis -- `after()`
  //  lanza ("called outside a request scope") y se queda el `setTimeout` de
  //  siempre, que ahi si vive porque el proceso no se congela.
  //
  //  Se importa aqui dentro: este modulo lo cargan tambien guiones fuera de Next.
  try {
    const { after } = await import('next/server');
    after(async () => {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      await ejecutar();
    });
  } catch {
    setTimeout(ejecutar, delay);
  }

  // Return a dummy Job object that mimics BullMQ Job structure
  return {
    id: `fallback-${queueName}-${Date.now()}`,
    name,
    data,
    opts: {},
  } as any;
}

/**
 * Enqueues a job in the appropriate queue, with automatic in-process fallback if Redis is offline.
 */
export async function addJob<K extends keyof JobPayloads>(
  queueName: K,
  name: string,
  data: JobPayloads[K],
  opts: { delay?: number; attempts?: number; backoff?: number } = {}
): Promise<Job | null> {
  const attempts = opts.attempts ?? 3;
  const backoff = opts.backoff ?? 5000; // 5 seconds default backoff retry

  //  EL RELOJ SE PONE SOLO CUANDO HAY A QUIEN ESPERAR (lote 185).
  //
  //  Antes el `setTimeout` del plazo se armaba SIEMPRE, nada mas entrar, aunque
  //  no hubiera cola -- que es el caso normal desde que se retiro `REDIS_URL` de
  //  Vercel. Como nadie lo cancelaba, 1,5 segundos despues escribia
  //
  //      [Queue] Timeout adding job to dgii-estado - Redis is likely offline
  //
  //  sin que nadie hubiera esperado nada. Y en serverless ese aviso sale dentro
  //  de la peticion que este corriendo EN ESE MOMENTO: en los logs de produccion
  //  del 2026-09-23 aparecia dentro de una impresion de factura, que no tiene
  //  nada que ver. Un log que señala al sitio equivocado cuesta mas que no
  //  tenerlo: mando a buscar el defecto donde no estaba.
  //
  //  Aqui arriba solo queda la variable, para poder cancelar el reloj en el
  //  `finally`. El reloj se arma mas abajo, cuando ya se sabe que hay cola a la
  //  que esperar.
  let relojDelPlazo: ReturnType<typeof setTimeout> | null = null;

  try {
    let addPromise: Promise<any>;

    if (queueName === 'dgii-submissions' && dgiiQueue) {
      addPromise = dgiiQueue.add(name, data, {
        attempts,
        backoff: { type: 'exponential', delay: backoff },
        ...opts
      });
    } else if (queueName === 'dgii-estado' && estadoQueue) {
      addPromise = estadoQueue.add(name, data, {
        attempts,
        backoff: { type: 'fixed', delay: backoff },
        ...opts
      });
    } else if (queueName === 'emails-sending' && emailQueue) {
      addPromise = emailQueue.add(name, data, {
        attempts,
        backoff: { type: 'fixed', delay: backoff },
        ...opts
      });
    } else {
      console.warn(`Could not add job to ${queueName}: Queue or Redis is offline.`);
      return await triggerFallback(queueName, name, data, opts.delay);
    }

    //  El plazo, ya con una cola de verdad a la que esperar.
    const conPlazo = <T>(promesa: Promise<T>): Promise<T | null> => {
      const espera = new Promise<null>((resolve) => {
        relojDelPlazo = setTimeout(() => {
          console.warn(`[Queue] Timeout adding job to ${queueName} - Redis is likely offline or unresponsive.`);
          resolve(null);
        }, 1500);
      });
      return Promise.race([promesa, espera]);
    };

    const result = await conPlazo(addPromise);
    if (result === null) {
      // Redis timed out
      return await triggerFallback(queueName, name, data, opts.delay);
    }
    return result;
  } catch (error: any) {
    console.error(`Failed to add job to queue ${queueName}:`, error.message);
    return await triggerFallback(queueName, name, data, opts.delay);
  } finally {
    //  Sin esto, el aviso saltaria igual cuando la cola SI respondio a tiempo.
    if (relojDelPlazo) clearTimeout(relojDelPlazo);
  }
}
