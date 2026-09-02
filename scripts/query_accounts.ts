import { db } from '../src/db';
import { chartOfAccounts, apPayments } from '../src/db/schema';

async function run() {
  const accs = await db.select().from(chartOfAccounts);
  console.log('Total accounts:', accs.length);
  
  const payments = await db.select().from(apPayments);
  
  let missingCount = 0;
  for (const p of payments) {
    const d = accs.find(a => a.id === p.debitAccountId);
    const c = accs.find(a => a.id === p.creditAccountId);
    if (!d || !c) {
      missingCount++;
      console.log(`Payment ${p.id} missing account: debit=${!!d}, credit=${!!c}`);
    }
  }
  console.log('Missing count:', missingCount);
  process.exit(0);
}
run().catch(console.error);
