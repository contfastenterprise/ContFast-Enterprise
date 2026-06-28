import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Removing Row Level Security (RLS) from "roles" table...');

    // Disable RLS on the roles table and drop tenant isolation policy
    await db.execute(sql`ALTER TABLE roles DISABLE ROW LEVEL SECURITY;`);
    await db.execute(sql`DROP POLICY IF EXISTS tenant_isolation ON roles;`);
    await db.execute(sql`DROP POLICY IF EXISTS tenant_isolation_policy ON roles;`);

    console.log('Successfully disabled RLS on "roles" table.');
  } catch (error) {
    console.error('Error disabling RLS on "roles" table:', error);
  }
  process.exit(0);
}

main();
