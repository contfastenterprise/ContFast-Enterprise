import { Queue, Job } from 'bullmq';
import { redis } from './redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Define Queues
export const dgiiQueue = redis ? new Queue('dgii-submissions', { connection: redis as any }) : null;
export const reportQueue = redis ? new Queue('reports-generation', { connection: redis as any }) : null;
export const emailQueue = redis ? new Queue('emails-sending', { connection: redis as any }) : null;

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
  };
}

/**
 * Enqueues a job in the appropriate queue.
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
      return null;
    }

    return await Promise.race([addPromise, timeoutPromise]);
  } catch (error: any) {
    console.error(`Failed to add job to queue ${queueName}:`, error.message);
    return null;
  }
}
