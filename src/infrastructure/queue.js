"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailQueue = exports.reportQueue = exports.dgiiQueue = void 0;
exports.addJob = addJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const jobRunners_1 = require("./jobRunners");
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Define Queues
exports.dgiiQueue = redis_1.redis ? new bullmq_1.Queue('dgii-submissions', { connection: redis_1.redis }) : null;
exports.reportQueue = redis_1.redis ? new bullmq_1.Queue('reports-generation', { connection: redis_1.redis }) : null;
exports.emailQueue = redis_1.redis ? new bullmq_1.Queue('emails-sending', { connection: redis_1.redis }) : null;
/**
 * Triggers in-process fallback execution for queues when Redis is offline.
 */
async function triggerFallback(queueName, name, data) {
    console.log(`[Queue Fallback] Redis is offline. Running job "${name}" of queue "${queueName}" in-process asynchronously...`);
    // Execute asynchronously to not block the calling request thread
    setTimeout(async () => {
        try {
            if (queueName === 'emails-sending') {
                await (0, jobRunners_1.sendEmailJob)(data);
            }
            else if (queueName === 'dgii-submissions') {
                await (0, jobRunners_1.processDgiiSubmissionJob)(data);
            }
            else if (queueName === 'reports-generation') {
                console.log('[Queue Fallback] Simulating report generation...');
                await new Promise((resolve) => setTimeout(resolve, 2000));
                console.log('[Queue Fallback] Report generation completed.');
            }
            else {
                console.warn(`[Queue Fallback] Unknown queue: ${queueName}`);
            }
        }
        catch (err) {
            console.error(`[Queue Fallback] Job "${name}" in queue "${queueName}" failed:`, err.message);
        }
    }, 0);
    // Return a dummy Job object that mimics BullMQ Job structure
    return {
        id: `fallback-${queueName}-${Date.now()}`,
        name,
        data,
        opts: {},
    };
}
/**
 * Enqueues a job in the appropriate queue, with automatic in-process fallback if Redis is offline.
 */
async function addJob(queueName, name, data, opts = {}) {
    const attempts = opts.attempts ?? 3;
    const backoff = opts.backoff ?? 5000; // 5 seconds default backoff retry
    // Safeguard: Timeout queue additions after 1500ms to prevent hanging if Redis is offline
    const timeoutPromise = new Promise((resolve) => setTimeout(() => {
        console.warn(`[Queue] Timeout adding job to ${queueName} - Redis is likely offline or unresponsive.`);
        resolve(null);
    }, 1500));
    try {
        let addPromise;
        if (queueName === 'dgii-submissions' && exports.dgiiQueue) {
            addPromise = exports.dgiiQueue.add(name, data, {
                attempts,
                backoff: { type: 'exponential', delay: backoff },
                ...opts
            });
        }
        else if (queueName === 'reports-generation' && exports.reportQueue) {
            addPromise = exports.reportQueue.add(name, data, {
                attempts,
                backoff: { type: 'fixed', delay: backoff },
                ...opts
            });
        }
        else if (queueName === 'emails-sending' && exports.emailQueue) {
            addPromise = exports.emailQueue.add(name, data, {
                attempts,
                backoff: { type: 'fixed', delay: backoff },
                ...opts
            });
        }
        else {
            console.warn(`Could not add job to ${queueName}: Queue or Redis is offline.`);
            return await triggerFallback(queueName, name, data);
        }
        const result = await Promise.race([addPromise, timeoutPromise]);
        if (result === null) {
            // Redis timed out
            return await triggerFallback(queueName, name, data);
        }
        return result;
    }
    catch (error) {
        console.error(`Failed to add job to queue ${queueName}:`, error.message);
        return await triggerFallback(queueName, name, data);
    }
}
