import { ReportRepository } from '../src/repositories/reportRepository';
import { db, customers } from '../src/db';

async function main() {
  try {
    const [cust] = await db.select().from(customers).limit(1);
    if (!cust) {
      console.log('No customers found in DB');
      process.exit(0);
    }
    const result = await ReportRepository.getARStatement(cust.companyId, cust.id);
    console.log('Result for customer:', cust.name);
    console.log('Open items:', JSON.stringify(result.openItems, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

main();
