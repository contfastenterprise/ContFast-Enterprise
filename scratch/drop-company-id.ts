import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Dropping "company_id" column from "roles" table...');

    // Drop the column and its index
    await db.execute(sql`DROP INDEX IF EXISTS roles_company_name_idx;`);
    await db.execute(sql`ALTER TABLE roles DROP COLUMN IF EXISTS company_id;`);

    console.log('Successfully dropped "company_id" column.');
  } catch (error) {
    console.error('Error dropping column:', error);
  }
  process.exit(0);
}

main();
