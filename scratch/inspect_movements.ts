import 'dotenv/config';
import { db } from '../src/db';
import { cashMovements } from '../src/db/schema/cash';
import { desc } from 'drizzle-orm';

async function run() {
  const movs = await db.select().from(cashMovements).orderBy(desc(cashMovements.createdAt)).limit(10);
  console.log(JSON.stringify(movs.map(m => ({
    id: m.id,
    type: m.type,
    amount: m.amount,
    invoiceId: m.invoiceId,
    description: m.description,
    reference: m.reference
  })), null, 2));
  process.exit(0);
}

run().catch(console.error);
