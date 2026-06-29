import { readFileSync } from 'fs';
import postgres from 'postgres';
import { resolve } from 'path';

async function main() {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const migrationPath = resolve(process.cwd(), 'drizzle/0021_marvelous_reavers_custom.sql');
  const migration = readFileSync(migrationPath, 'utf8');

  try {
    console.log('Applying migration...');
    await sql.unsafe(migration);
    console.log('Migration applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

main();
