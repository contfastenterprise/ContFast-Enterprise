const postgres = require('postgres');

try {
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('.env loaded natively or not needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing database connection string.');
  process.exit(1);
}

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const companiesList = await sql`SELECT id, name, rnc FROM companies`;
    console.log('\n--- COMPANIES ---');
    console.log(companiesList);

    const subsList = await sql`SELECT * FROM subscriptions`;
    console.log('\n--- ALL SUBSCRIPTIONS ---');
    console.log(subsList);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

run();
