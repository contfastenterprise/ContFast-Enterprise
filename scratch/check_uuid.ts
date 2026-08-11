import 'dotenv/config';
import { db } from '../src/db';
import { invoices } from '../src/db/schema/invoices';
import { payments } from '../src/db/schema/payments';
import { accountsReceivable, accountsReceivablePayments } from '../src/db/schema/receivables';
import { eq } from 'drizzle-orm';

async function check() {
  const uuid = "bae27884-bd34-4a2a-bc1c-3b63bdd94363";
  
  const inInv = await db.select().from(invoices).where(eq(invoices.id, uuid));
  console.log('Invoices:', inInv.length);

  try {
     const inArp = await db.select().from(accountsReceivablePayments).where(eq(accountsReceivablePayments.id, uuid));
     console.log('AR Payments:', inArp.length, inArp[0]);
  } catch (e) {
     console.log('accountsReceivablePayments not found or err');
  }

  process.exit(0);
}
check();
