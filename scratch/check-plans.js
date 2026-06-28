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
    const list = await sql`SELECT * FROM plans`;
    console.log('\n--- PLANS IN DATABASE ---');
    console.log(list);
  } catch (err) {
    console.error('Failed to select plans:', err);
  } finally {
    await sql.end();
  }
}

run();
