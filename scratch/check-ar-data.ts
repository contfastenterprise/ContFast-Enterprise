import { db, accountsReceivable, invoices } from '../src/db';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const arItems = await db
      .select({
        arId: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        dueDate: accountsReceivable.dueDate,
        amount: accountsReceivable.amount,
        balance: accountsReceivable.balance,
        invoiceNcf: invoices.ncf,
        invoiceCreatedAt: invoices.createdAt,
      })
      .from(accountsReceivable)
      .leftJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .limit(10);
    
    console.log('Accounts Receivable records:');
    console.log(JSON.stringify(arItems, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

main();
