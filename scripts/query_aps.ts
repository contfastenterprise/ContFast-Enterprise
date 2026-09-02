import { db } from '../src/db';
import { apPayments, accountsPayable, suppliers } from '../src/db/schema';

async function run() {
  const aps = await db.select().from(accountsPayable);
  const supps = await db.select().from(suppliers);
  const payments = await db.select().from(apPayments);
  
  let missingCount = 0;
  for (const p of payments) {
    const ap = aps.find(a => a.id === p.apId);
    let s = null;
    if (ap) {
      s = supps.find(s => s.id === ap.supplierId);
    }
    if (!ap || !s) {
      missingCount++;
      console.log(`Payment ${p.id} missing: ap=${!!ap}, supplier=${!!s}`);
    }
  }
  console.log('Missing AP or Supplier count:', missingCount);
  process.exit(0);
}
run().catch(console.error);
