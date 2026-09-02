import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { db, dgiiSubmissions } from '@/db';
import { eq, and } from 'drizzle-orm';
import { envioEnCurso } from '@/repositories/dgiiSubmissionRepository';
import { processDgiiSubmissionJob, sendEmailJob } from './jobRunners';

const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '5', 10);

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.IS_BUILD === 'true';

if (redis && !isBuildPhase) {
  console.log('Initializing BullMQ Workers...');

  // 1. DGII Submissions Worker
  const dgiiWorker = new Worker(
    'dgii-submissions',
    async (job: Job) => {
      const { companyId, invoiceId } = job.data;
      return await processDgiiSubmissionJob({
        companyId,
        invoiceId,
        attemptsMade: job.attemptsMade,
      });
    },
    { connection: redis as any, concurrency: CONCURRENCY, skipVersionCheck: true }
  );

  dgiiWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (dgii-submissions) completed successfully.`);
  });

// Nota de aislamiento: esta actualizacion de dgii_submissions no filtra por
// `modo` y no hace falta. Se localiza por el id del propio intento, y ese id
// ya determina factura, empresa y entorno.
//
// Lo que SI hacia falta: antes iba por `invoice_id + company_id`, sin decir
// que fila, y marcaba como 'failed' TODOS los intentos de la factura --
// incluido uno anterior que estuviera aceptado.
  dgiiWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (dgii-submissions) failed (attempt ${job?.attemptsMade}): ${err.message}`);
    // On final failure (all retries exhausted), mark submission as failed
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      const { companyId, invoiceId, submissionId } = job.data;
      // Los trabajos ya encolados no traen submissionId; para esos se deduce
      // el intento vivo, que nunca es uno ya aceptado.
      Promise.resolve(submissionId ?? envioEnCurso(invoiceId, companyId))
        .then((id) => {
          if (!id) return;
          return db.update(dgiiSubmissions)
            .set({ status: 'failed', responseMessage: err.message, updatedAt: new Date() })
            .where(and(eq(dgiiSubmissions.id, id), eq(dgiiSubmissions.companyId, companyId)));
        })
        .catch((e: any) => console.error('[Worker] Failed to update dgii_submissions on exhausted retries:', e));
    }
  });

  dgiiWorker.on('error', (err) => {
    console.error(`[Worker] (dgii-submissions) connection/redis error: ${err.message}`);
  });

  // 2. Reports Generation Worker
  const reportWorker = new Worker(
    'reports-generation',
    async (job: Job) => {
      const { companyId, reportType, format, params, userId } = job.data;
      console.log(`[Worker] Generating ${format.toUpperCase()} report of type ${reportType} for company ${companyId}...`);

      // Simulating heavy report computation (PDF/Excel generation)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log(`[Worker] Report generation complete.`);
      return { success: true, path: `/reports/${companyId}/${reportType}_${Date.now()}.${format}` };
    },
    { connection: redis as any, concurrency: 1, skipVersionCheck: true } // Process one heavy report at a time
  );

  reportWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (reports-generation) completed successfully.`);
  });

  reportWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (reports-generation) failed with error:`, err.message);
  });

  reportWorker.on('error', (err) => {
    console.error(`[Worker] (reports-generation) connection/redis error: ${err.message}`);
  });

  // 3. Email Sending Worker
  const emailWorker = new Worker(
    'emails-sending',
    async (job: Job) => {
      return await sendEmailJob(job.data);
    },
    { connection: redis as any, concurrency: CONCURRENCY, skipVersionCheck: true }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (emails-sending) completed successfully.`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (emails-sending) failed with error:`, err.message);
  });

  emailWorker.on('error', (err) => {
    console.error(`[Worker] (emails-sending) connection/redis error: ${err.message}`);
  });
} else {
  console.warn('BullMQ Workers not initialized: Redis is offline or not configured.');
}
