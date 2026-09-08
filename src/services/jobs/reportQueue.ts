import { Queue, Worker } from 'bullmq';
import { redis } from '@/infrastructure/redis';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const PDF_TEMP_DIR = isProduction
  ? path.join(os.tmpdir(), 'contfast-temp-docs')
  : (process.env.PDF_TEMP_DIR || path.join(os.tmpdir(), 'contfast-temp-docs'));

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.IS_BUILD === 'true';

// La cola 'reports' y su worker vivian aqui. El worker no generaba nada:
// dormia 5 segundos y devolvia un documentId inventado a partir del id del
// job, que jobs/[jobId] firmaba con HMAC y servia al cliente como
// status 'ready'. Ninguna pantalla la usaba (los botones de imprimir van a
// rutas propias y reales), asi que se elimina junto con las dos rutas que la
// consumian, en vez de dejar un exito fabricado esperando a que alguien lo
// enganche. Lo que queda en este archivo -- el barrido de PDF temporales --
// si es codigo real, y ahora ademas se programa (ver instrumentation.ts).

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

