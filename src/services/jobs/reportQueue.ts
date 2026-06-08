import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PDF_TEMP_DIR = process.env.PDF_TEMP_DIR || './storage/temp-docs';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const reportQueue = new Queue('reports', { connection: connection as any });

// Define job types
export interface ReportJobData {
  reportType: string;
  format: 'pdf' | 'xlsx';
  filters: any;
  companyId: string;
  userId: string;
}

// Background Worker
export const reportWorker = new Worker('reports', async (job: Job<ReportJobData>) => {
  console.log(`Processing report job ${job.id} of type ${job.data.reportType}`);
  // Here we would delegate to specific report generation logic based on job.data.reportType
  // For demonstration, simulating a delay and returning a fake DocumentService generated URL
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const documentId = 'fake-uuid-' + job.id; // En realidad llamar a DocumentService.saveTemporaryFile
  // Y luego retornar el ID para que el endpoint pueda generar la URL firmada
  return { documentId };
}, { connection: connection as any });

// Recurring Cleanup Job Setup
export const cleanupQueue = new Queue('cleanup', { connection: connection as any });

export const cleanupWorker = new Worker('cleanup', async () => {
  console.log('Running temporary file cleanup job');
  try {
    const files = await fs.readdir(PDF_TEMP_DIR);
    const now = Date.now();
    const FIFTEEN_MINUTES = 15 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(PDF_TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > FIFTEEN_MINUTES) {
        await fs.unlink(filePath);
        console.log(`Deleted expired temporary file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error during cleanup job:', error);
  }
}, { connection: connection as any });

// Schedule cleanup job every 5 minutes
export async function setupRecurringJobs() {
  await cleanupQueue.add('cleanup-temp-docs', {}, {
    repeat: {
      pattern: '*/5 * * * *' // Every 5 minutes
    }
  });
}
