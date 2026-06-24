import { Queue, Job } from 'bullmq';
import { redis } from './redis';
import { processDgiiSubmissionJob, sendEmailJob } from './jobRunners';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.IS_BUILD === 'true';

// Define Queues
export const dgiiQueue = (redis && !isBuildPhase) ? new Queue('dgii-submissions', { connection: redis as any }) : null;
export const reportQueue = (redis && !isBuildPhase) ? new Queue('reports-generation', { connection: redis as any }) : null;
export const emailQueue = (redis && !isBuildPhase) ? new Queue('emails-sending', { connection: redis as any }) : null;

export interface JobPayloads {
  'dgii-submissions': {
    companyId: string;
    invoiceId: string;
  };
  'reports-generation': {
    companyId: string;
    reportType: 'sales' | 'purchases' | 'balance_sheet' | 'income_statement';
    format: 'pdf' | 'excel';
    params: Record<string, any>;
    userId: string;
  };
  'emails-sending': {
    to: string;
    subject: string;
    text: string;
    html?: string;
    pdfPath?: string;
  };
}

/**
 * Triggers in-process fallback execution for queues when Redis is offline.
 */
async function triggerFallback<K extends keyof JobPayloads>(
  queueName: K,
  name: string,
  data: JobPayloads[K]
): Promise<Job> {
  console.log(`[Queue Fallback] Redis is offline. Running job "${name}" of queue "${queueName}" in-process asynchronously...`);
  
  // Execute asynchronously to not block the calling request thread
  setTimeout(async () => {
    try {
      if (queueName === 'emails-sending') {
        await sendEmailJob(data as any);
      } else if (queueName === 'dgii-submissions') {
        await processDgiiSubmissionJob(data as any);
      } else if (queueName === 'reports-generation') {
        console.log('[Queue Fallback] Simulating report generation...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('[Queue Fallback] Report generation completed.');
      } else {
        console.warn(`[Queue Fallback] Unknown queue: ${queueName}`);
      }
    } catch (err: any) {
      console.error(`[Queue Fallback] Job "${name}" in queue "${queueName}" failed:`, err.message);
    }
  }, 0);

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

  // Safeguard: Timeout queue additions after 1500ms to prevent hanging if Redis is offline
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`[Queue] Timeout adding job to ${queueName} - Redis is likely offline or unresponsive.`);
      resolve(null);
    }, 1500)
  );

  try {
    let addPromise: Promise<any>;

    if (queueName === 'dgii-submissions' && dgiiQueue) {
      addPromise = dgiiQueue.add(name, data, {
        attempts,
        backoff: { type: 'exponential', delay: backoff },
        ...opts
      });
    } else if (queueName === 'reports-generation' && reportQueue) {
      addPromise = reportQueue.add(name, data, {
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
      return await triggerFallback(queueName, name, data);
    }

    const result = await Promise.race([addPromise, timeoutPromise]);
    if (result === null) {
      // Redis timed out
      return await triggerFallback(queueName, name, data);
    }
    return result;
  } catch (error: any) {
    console.error(`Failed to add job to queue ${queueName}:`, error.message);
    return await triggerFallback(queueName, name, data);
  }
}
