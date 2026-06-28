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
  console.log('Connecting to database to apply RLS policies to all tenant tables...');
  const sql = postgres(connectionString, { prepare: false });

  try {
    // Get all tables that have a company_id column
    const tables = await sql`
      SELECT t.table_name
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND EXISTS (
          SELECT 1 
          FROM information_schema.columns col 
          WHERE col.table_schema = t.table_schema 
            AND col.table_name = t.table_name 
            AND col.column_name = 'company_id'
        )
      ORDER BY t.table_name;
    `;

    console.log(`Found ${tables.length} tables with company_id column.`);

    for (const row of tables) {
      const table = row.table_name;
      console.log(`Securing table: ${table}...`);
      
      // 1. Enable RLS
      await sql.unsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      
      // 2. Create Restrictive Policy
      await sql.unsafe(`
        DROP POLICY IF EXISTS tenant_isolation_policy ON "${table}";
        CREATE POLICY tenant_isolation_policy ON "${table}"
        AS RESTRICTIVE
        USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
      `);
      
      console.log(`[OK] Enabled RLS and applied tenant_isolation_policy on ${table}`);
    }

    console.log('\nAll tenant tables have been successfully secured with RLS policies!');
  } catch (err) {
    console.error('Failed to apply RLS policies:', err);
  } finally {
    await sql.end();
  }
}

run();
