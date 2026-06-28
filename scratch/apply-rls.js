const postgres = require('postgres');

// Load environment variables
try {
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('Natively loaded or no .env needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing connection string in environment variables.');
  process.exit(1);
}

const tenantTables = [
  'company_settings',
  'users',
  'roles',
  'products',
  'invoices',
  'expenses',
  'ecf_sequences',
  'subscriptions',
  'journal_entries',
  'journal_entry_lines'
];

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { prepare: false });

  try {
    console.log('Enabling Row Level Security (RLS) on tenant tables...');
    for (const table of tenantTables) {
      console.log(`- Enabling RLS on ${table}...`);
      await sql.unsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      
      // Create policy to ensure regular roles are isolated by company_id setting
      console.log(`- Creating tenant isolation policy on ${table}...`);
      await sql.unsafe(`
        DROP POLICY IF EXISTS tenant_isolation_policy ON "${table}";
        CREATE POLICY tenant_isolation_policy ON "${table}"
        AS RESTRICTIVE
        USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
      `);
    }

    console.log('All database Row Level Security (RLS) configurations applied successfully!');
  } catch (err) {
    console.error('Failed to apply RLS policies:', err);
  } finally {
    await sql.end();
  }
}

run();
