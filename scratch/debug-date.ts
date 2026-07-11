import { ReportRepository } from '../src/repositories/reportRepository';
import { db, customers } from '../src/db';

async function main() {
  try {
    const cust = await db.select().from(customers).limit(10);
    for (const c of cust) {
      const result = await ReportRepository.getARStatement(c.companyId, c.id);
      if (result.openItems.length > 0) {
        const item = result.openItems[0];
        console.log('item.date value:', item.date);
        console.log('typeof item.date:', typeof item.date);
        console.log('item.date instanceof Date:', item.date instanceof Date);
        console.log('new Date(item.date) output:', new Date(item.date).toString());
        break;
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

main();
