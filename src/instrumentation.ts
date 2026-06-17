export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Starting background BullMQ workers...');
    await import('./infrastructure/worker');
  }
}
