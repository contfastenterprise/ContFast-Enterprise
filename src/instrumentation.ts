export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('[Instrumentation] Build phase detected. Skipping background BullMQ workers.');
      return;
    }
    console.log('[Instrumentation] Starting background BullMQ workers...');
    await import('./infrastructure/worker');
  }
}
