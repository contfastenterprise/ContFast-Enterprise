import { syncCustomerToGoogleContacts } from './src/services/googleContactsService';
import * as fs from 'fs';
import * as path from 'path';

// Simple manual .env parser
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnv();

async function runTest() {
  console.log('--- STARTING GOOGLE CONTACTS SYNC TEST ---');
  console.log('Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Missing');
  console.log('Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'Missing');
  console.log('Refresh Token:', process.env.GOOGLE_REFRESH_TOKEN ? 'Configured' : 'Missing');

  const testCustomer = {
    name: 'Cliente de Prueba ContFast',
    email: 'clientetestcontfast@example.com',
    phone: '809-555-0199',
    address: 'Av. Winston Churchill, Santo Domingo'
  };

  console.log('\nTriggering syncCustomerToGoogleContacts for test customer:', testCustomer);
  await syncCustomerToGoogleContacts(testCustomer);
  console.log('\nSync execution finished. Check logs above.');
}

runTest().catch(console.error);
