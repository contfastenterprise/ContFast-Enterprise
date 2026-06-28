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
    const list = await sql`SELECT s.*, p.name as plan_name, c.name as company_name 
      FROM subscriptions s 
      LEFT JOIN plans p ON s.plan_id = p.id
      LEFT JOIN companies c ON s.company_id = c.id`;
    console.log('\n--- SUBSCRIPTIONS IN DATABASE ---');
    console.log(list);
  } catch (err) {
    console.error('Failed to select subscriptions:', err);
  } finally {
    await sql.end();
  }
}

run();
