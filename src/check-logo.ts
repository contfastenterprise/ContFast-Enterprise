import { db } from './db';
import { sql } from 'drizzle-orm';

async function run() {
  const res = await db.execute(sql`SELECT * FROM companies `);
  console.log('Companies:', res);
  const res2 = await db.execute(sql`SELECT * FROM company_settings LIMIT 1`);
  console.log('Settings:', res2);
  process.exit(0);
}

run().catch(console.error);
