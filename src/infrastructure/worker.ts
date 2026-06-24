import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { db, dgiiSubmissions } from '@/db';
import { eq, and } from 'drizzle-orm';
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
    { connection: redis as any, concurrency: CONCURRENCY }
  );

  dgiiWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (dgii-submissions) completed successfully.`);
  });

  dgiiWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (dgii-submissions) failed (attempt ${job?.attemptsMade}): ${err.message}`);
    // On final failure (all retries exhausted), mark submission as failed
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      const { companyId, invoiceId } = job.data;
      db.update(dgiiSubmissions)
        .set({ status: 'failed', responseMessage: err.message, updatedAt: new Date() })
        .where(and(eq(dgiiSubmissions.invoiceId, invoiceId), eq(dgiiSubmissions.companyId, companyId)))
        .catch((e: any) => console.error('[Worker] Failed to update dgii_submissions on exhausted retries:', e));
    }
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
    { connection: redis as any, concurrency: 1 } // Process one heavy report at a time
  );

  reportWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (reports-generation) completed successfully.`);
  });

  reportWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (reports-generation) failed with error:`, err.message);
  });

  // 3. Email Sending Worker
  const emailWorker = new Worker(
    'emails-sending',
    async (job: Job) => {
      return await sendEmailJob(job.data);
    },
    { connection: redis as any, concurrency: CONCURRENCY }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (emails-sending) completed successfully.`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (emails-sending) failed with error:`, err.message);
  });
} else {
  console.warn('BullMQ Workers not initialized: Redis is offline or not configured.');
}
