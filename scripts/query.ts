import { db } from '../src/db';
import { apPayments, checks } from '../src/db/schema';

async function run() {
  const payments = await db.select().from(apPayments);
  console.log('Payments:', JSON.stringify(payments, null, 2));
  
  const chks = await db.select().from(checks);
  console.log('Checks:', JSON.stringify(chks, null, 2));

  process.exit(0);
}
run().catch(console.error);
