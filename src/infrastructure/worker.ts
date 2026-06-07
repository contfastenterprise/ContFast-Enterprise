import { Worker, Job } from 'bullmq';
import { redis } from './redis';

const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '5', 10);

if (redis) {
  console.log('Initializing BullMQ Workers...');

  // 1. DGII Submissions Worker
  const dgiiWorker = new Worker(
    'dgii-submissions',
    async (job: Job) => {
      const { companyId, invoiceId } = job.data;
      console.log(`[Worker] Processing DGII submission for invoice ${invoiceId}...`);
      
      // Simulating call to DGII (Will call dgiiService in business logic layer)
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      console.log(`[Worker] DGII submission complete for invoice ${invoiceId}.`);
      return { success: true, trackId: `track_${Math.random().toString(36).substr(2, 9)}` };
    },
    { connection: redis as any, concurrency: CONCURRENCY }
  );

  dgiiWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} (dgii-submissions) completed successfully.`);
  });

  dgiiWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (dgii-submissions) failed with error:`, err.message);
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
      const { to, subject, text, html } = job.data;
      console.log(`[Worker] Sending email to: ${to} with subject: "${subject}"...`);
      
      // Simulating SMTP send
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      console.log(`[Worker] Email sent to ${to}.`);
      return { success: true };
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
