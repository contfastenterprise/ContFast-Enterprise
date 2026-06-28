import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Starting database reset (truncating all tables)...');

    // Get all tables in the public schema except drizzle migration tables
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '%drizzle%'
        AND table_name NOT IN ('roles', 'plans')
    `);

    const tables = (tablesResult as any).map((row: any) => row.table_name);
    console.log(`Found tables to truncate: ${tables.join(', ')}`);

    if (tables.length === 0) {
      console.log('No tables found to truncate.');
      process.exit(0);
    }

    // Generate and run dynamic TRUNCATE statement with CASCADE
    const truncateQuery = sql.raw(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
    await db.execute(truncateQuery);
    
    console.log('Database successfully reset! All data truncated.');
  } catch (error) {
    console.error('Error resetting database:', error);
  }
  process.exit(0);
}

main();
