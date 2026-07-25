import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  console.log('Altering companies table to add phone column...');
  await sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50);`;
  console.log('Altered successfully.');
  await sql.end();
}

run().catch(err => {
  console.error('Failed to run sql:', err);
  process.exit(1);
});
