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
//
// LOTE 183: ESTE BARRIDO YA NO BARRE NADA UTIL. Los PDF temporales viven en un
// bucket desde que se descubrio que en el disco de la instancia no los
// encontraba la peticion de descarga (404 al imprimir un recibo). El que barre
// ahora es `DocumentService.barrerViejos()`, que se llama al guardar uno nuevo y
// no necesita Redis -- retirado de Vercel el 2026-09-22 por cuota agotada, con
// lo que esto no se programaba de todas formas.
//
// Se deja en pie y no se retira porque el directorio local SIGUE existiendo en
// desarrollo por otros caminos, y borrar codigo de limpieza sin medir es como
// empezo el problema de los temporales que no se borraban nunca.

// Recurring Cleanup Job Setup
export const cleanupQueue = (redis && !isBuildPhase) ? new Queue('cleanup', { connection: redis }) : null;

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
}, { connection: redis }) : null;

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

