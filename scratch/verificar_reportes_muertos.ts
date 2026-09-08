import { existsSync } from 'fs';
import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const contar = (s: string, sub: string): number => s.split(sub).length - 1;

// ═════════════════ Andamiaje muerto de reportes + barrido de temporales ═════════════════
// Habia DOS tuberias de reportes paralelas, y ninguna generaba nada:
//   1) cola 'reports' (services/jobs/reportQueue.ts) + su worker, que dormia 5s y
//      devolvia un documentId inventado; jobs/[jobId] lo firmaba con HMAC y respondia
//      status 'ready' con un enlace a un documento que nunca existio.
//   2) cola 'reports-generation' (infrastructure/queue.ts + worker.ts), cuyo worker
//      tambien dormia 5s y devolvia la ruta de un archivo nunca escrito, y cuyo
//      addJob('reports-generation', ...) no tenia un solo llamador en el repo.
// Ninguna era alcanzable desde la app (los botones de imprimir van a rutas propias y
// reales), asi que se eliminan ambas junto con las 2 rutas API sin llamadores.
//
// Aparte, un bug vivo: el barrido de PDF temporales (cleanupWorker) existia, pero nadie
// llamaba a setupRecurringJobs(), asi que el cron nunca se programaba y los PDF que
// generan las 8 rutas de impresion vivas y el usuario no llega a descargar se quedaban
// en disco indefinidamente. Ahora se programa desde instrumentation.ts.

// ─────────────── 1. rutas API sin llamadores, eliminadas ───────────────
ok('ruta reports/[reportType]/print eliminada', !existsSync('src/app/api/v1/reports/[reportType]/print/route.ts'));
ok('ruta jobs/[jobId] eliminada', !existsSync('src/app/api/v1/jobs/[jobId]/route.ts'));

// ─────────────── 2. instrumentation.ts: se programa el barrido ───────────────
{
  const src = crudo('src/instrumentation.ts');
  ok(
    'instrumentation: importa setupRecurringJobs del modulo de jobs',
    src.includes("const { setupRecurringJobs } = await import('./services/jobs/reportQueue');")
  );
  ok('instrumentation: lo invoca', src.includes('await setupRecurringJobs();'));
  ok(
    'instrumentation: un fallo del barrido no impide el arranque (try/catch)',
    src.includes("'[Instrumentation] No se pudo programar el barrido de temporales:',")
  );
}

// ─────────────── 3. services/jobs/reportQueue.ts ───────────────
{
  const src = crudo('src/services/jobs/reportQueue.ts');
  ok(
    'reportQueue: el import ya no trae Job (solo lo usaba el worker falso)',
    src.includes("import { Queue, Worker } from 'bullmq';")
  );
  ok("reportQueue: sin la cola 'reports'", !src.includes("new Queue('reports',"));
  ok('reportQueue: sin el documentId fabricado', !src.includes("'fake-uuid-'"));
  ok('reportQueue: sin la interfaz ReportJobData', !src.includes('ReportJobData'));
  ok('reportQueue: sin el worker falso', !src.includes('reportWorker'));
  ok(
    'reportQueue: conserva el barrido real y ya no exporta reportQueue',
    src.includes('export const cleanupQueue') &&
      src.includes('export const cleanupWorker') &&
      src.includes('export async function setupRecurringJobs') &&
      !src.includes('export const reportQueue')
  );
}

// ─────────────── 4. infrastructure/queue.ts ───────────────
{
  const src = crudo('src/infrastructure/queue.ts');
  ok(
    "queue: 0 menciones de 'reports-generation', y siguen vivas las 2 colas reales",
    contar(src, 'reports-generation') === 0 &&
      src.includes("new Queue('dgii-submissions'") &&
      src.includes("new Queue('emails-sending'")
  );
  ok('queue: addJob ya no tiene rama de reportes', !src.includes('reportQueue.add('));
  ok(
    'queue: el fallback en proceso ya no simula generar reportes',
    !src.includes('[Queue Fallback] Simulating report generation...')
  );
}

// ─────────────── 5. infrastructure/worker.ts ───────────────
{
  const src = crudo('src/infrastructure/worker.ts');
  ok(
    "worker: 0 menciones de 'reports-generation', y siguen los 2 workers reales",
    contar(src, 'reports-generation') === 0 &&
      src.includes("'dgii-submissions',") &&
      src.includes("'emails-sending',")
  );
  ok('worker: el de correos pasa a ser el numero 2', src.includes('// 2. Email Sending Worker'));
}

// ─────────────── 6. tests/permisosRutas.vitest.ts ───────────────
{
  const src = crudo('src/tests/permisosRutas.vitest.ts');
  ok('permisosRutas: PENDIENTES ya no lista la ruta eliminada', !src.includes("'v1/jobs/[jobId]/route.ts',"));
  ok(
    'permisosRutas: la nota de PENDIENTES ya no menciona jobs/[jobId]',
    src.includes(' *  - `auth/*` opera sobre la propia sesion del solicitante.')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
