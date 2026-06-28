import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Starting RLS application script...');

    // 1. Get all tables in the public schema that have a company_id column
    const query = sql`
      SELECT table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND column_name = 'company_id'
        AND table_name NOT LIKE 'v_public_%'
    `;
    const result = await db.execute(query);
    const tables = (result as any).map((row: any) => row.table_name);

    console.log(`Found ${tables.length} tables that contain company_id:`);
    console.log(tables.join(', '));

    for (const tableName of tables) {
      console.log(`\n--- Securing table: "${tableName}" ---`);

      // A. Enable RLS
      await db.execute(sql.raw(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`));
      console.log(` - Enabled Row Level Security (RLS)`);

      // B. Drop any existing tenant policy to avoid duplicates/conflicts
      await db.execute(sql.raw(`DROP POLICY IF EXISTS tenant_isolation ON "${tableName}";`));

      // C. Create the secure tenant isolation policy
      const policyQuery = sql.raw(`
        CREATE POLICY tenant_isolation ON "${tableName}"
        TO authenticated
        USING (
          company_id = COALESCE(
            NULLIF(current_setting('app.current_company_id', true), '')::uuid,
            (NULLIF(auth.jwt() -> 'app_metadata' ->> 'company_id', ''))::uuid
          )
        )
        WITH CHECK (
          company_id = COALESCE(
            NULLIF(current_setting('app.current_company_id', true), '')::uuid,
            (NULLIF(auth.jwt() -> 'app_metadata' ->> 'company_id', ''))::uuid
          )
        );
      `);
      await db.execute(policyQuery);
      console.log(` - Created tenant_isolation policy`);
    }

    console.log('\nAll tenant tables have been successfully secured with RLS!');
  } catch (error) {
    console.error('Error applying RLS policies:', error);
  }
  process.exit(0);
}

main();
