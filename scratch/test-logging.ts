// Emulate production environment
process.env.NODE_ENV = 'production';
process.env.NEXT_RUNTIME = 'nodejs';

import { register } from '../src/instrumentation';

async function runTest() {
  console.log('--- Initializing Global Logging Interceptor ---');
  await register();

  console.log('--- Test console.log ---');
  console.log('Standard log entry');
  console.log('Log entry with context', { user: 'Gerson', role: 'admin' });

  console.log('--- Test console.info ---');
  console.info('Information log entry', { companyId: '123' });

  console.log('--- Test console.warn ---');
  console.warn('Warning log entry', { code: 'LOW_STOCK' });

  console.log('--- Test console.error ---');
  console.error('Error log entry', new Error('Something went wrong!'));
}

runTest();
