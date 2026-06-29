import { AccountingRepository } from '@/repositories/accountingRepository';
import { db, companies } from '@/db';

async function main() {
  const allComps = await db.select().from(companies);
  for (const c of allComps) {
    console.log('Company:', c.name, 'RNC:', c.rnc);
    const mappings = await AccountingRepository.getMappings(c.id);
    console.log('Mappings:', mappings.length);
  }
}
main().catch(console.error);
