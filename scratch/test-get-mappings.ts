import { db, companies } from '@/db';
import { AccountingRepository } from '@/repositories/accountingRepository';

async function test() {
  const comp = await db.query.companies.findFirst({
    where: (c, { eq }) => eq(c.name, 'Prueba')
  });
  if (comp) {
    const mappings = await AccountingRepository.getMappings(comp.id);
    console.log(mappings);
  }
}
test().catch(console.error);
