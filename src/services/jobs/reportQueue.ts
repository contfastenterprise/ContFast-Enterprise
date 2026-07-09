import { Queue, Worker, Job } from 'bullmq';
import { redis } from '@/infrastructure/redis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const PDF_TEMP_DIR = process.env.PDF_TEMP_DIR || path.join(os.tmpdir(), 'contfast-temp-docs');

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.IS_BUILD === 'true';

export const reportQueue = (redis && !isBuildPhase) ? new Queue('reports', { connection: redis as any }) : null;

// Define job types
export interface ReportJobData {
  reportType: string;
  format: 'pdf' | 'xlsx';
  filters: any;
  companyId: string;
  userId: string;
}

// Background Worker
export const reportWorker = (redis && !isBuildPhase) ? new Worker('reports', async (job: Job<ReportJobData>) => {
  console.log(`Processing report job ${job.id} of type ${job.data.reportType}`);
  // Here we would delegate to specific report generation logic based on job.data.reportType
  // For demonstration, simulating a delay and returning a fake DocumentService generated URL
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const documentId = 'fake-uuid-' + job.id; // En realidad llamar a DocumentService.saveTemporaryFile
  // Y luego retornar el ID para que el endpoint pueda generar la URL firmada
  return { documentId };
}, { connection: redis as any }) : null;

// Recurring Cleanup Job Setup
export const cleanupQueue = (redis && !isBuildPhase) ? new Queue('cleanup', { connection: redis as any }) : null;

export const cleanupWorker = (redis && !isBuildPhase) ? new Worker('cleanup', async () => {
  console.log('Running temporary file cleanup job');
  try {
    const files = await fs.readdir(/*turbopackIgnore: true*/ PDF_TEMP_DIR);
    const now = Date.now();
    const FIFTEEN_MINUTES = 15 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(/*turbopackIgnore: true*/ PDF_TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > FIFTEEN_MINUTES) {
        await fs.unlink(filePath);
        console.log(`Deleted expired temporary file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error during cleanup job:', error);
  }
}, { connection: redis as any }) : null;

// Schedule cleanup job every 5 minutes
export async function setupRecurringJobs() {
  if (cleanupQueue) {
    await cleanupQueue.add('cleanup-temp-docs', {}, {
      repeat: {
        pattern: '*/5 * * * *' // Every 5 minutes
      }
    });
  } else {
    console.warn('Redis is offline: Skipping recurring cleanup job setup.');
  }
}

