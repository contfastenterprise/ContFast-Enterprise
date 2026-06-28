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
  console.log('Connecting to database to audit RLS policies...');
  const sql = postgres(connectionString, { prepare: false });

  try {
    const results = await sql`
      SELECT 
        t.table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls,
        EXISTS (
          SELECT 1 
          FROM pg_policy p 
          WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation_policy'
        ) AS has_tenant_policy
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema = 'public'
        AND EXISTS (
          SELECT 1 
          FROM information_schema.columns col 
          WHERE col.table_schema = t.table_schema 
            AND col.table_name = t.table_name 
            AND col.column_name = 'company_id'
        )
      ORDER BY t.table_name;
    `;

    console.log('\n--- RLS & Tenant Policy Audit ---');
    console.log('Table Name | RLS Enabled | Force RLS | Has tenant_isolation_policy');
    console.log('-------------------------------------------------------------------');
    for (const r of results) {
      console.log(`${r.table_name.padEnd(30)} | ${r.rls_enabled ? 'YES' : 'NO '} | ${r.force_rls ? 'YES' : 'NO '} | ${r.has_tenant_policy ? 'YES' : 'NO'}`);
    }
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await sql.end();
  }
}

run();
