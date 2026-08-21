import { db } from './src/db';
import { companies } from './src/db/schema/companies';

async function run() {
  const all = await db.select({
    id: companies.id,
    name: companies.name,
    status: companies.status
  }).from(companies);
  
  console.log('Companies:');
  all.forEach(c => console.log(c.name, c.status));
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
