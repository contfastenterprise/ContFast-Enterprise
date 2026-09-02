import { db } from '../src/db';
import { ApRepository } from '../src/repositories/apRepository';

async function run() {
  try {
    const res = await ApRepository.getPayments('38a1a51e-cb4a-4798-ad19-0f44a7ded32d', { status: 'applied', modo: 'PRODUCCION' });
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
