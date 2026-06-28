import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('--- Database RLS Audit Report ---\n');

    // Query to get table name, whether it has company_id, if RLS is enabled, and existing policies
    const auditQuery = sql`
      SELECT 
        t.table_name,
        EXISTS (
          SELECT 1 
          FROM information_schema.columns c 
          WHERE c.table_schema = 'public' 
            AND c.table_name = t.table_name 
            AND c.column_name = 'company_id'
        ) AS has_company_id,
        c.relrowsecurity AS rls_enabled,
        (
          SELECT string_agg(pol.polname, ', ') 
          FROM pg_policy pol 
          WHERE pol.polrelid = c.oid
        ) AS policies
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE '%drizzle%'
      ORDER BY t.table_name;
    `;

    const result = await db.execute(auditQuery);
    const report = result as any;

    console.log(`Auditing ${report.length} tables in total:\n`);
    
    let securedCount = 0;
    let ignoredCount = 0;
    let alertCount = 0;

    for (const row of report) {
      const status = row.rls_enabled 
        ? '✅ RLS ENABLED' 
        : (row.has_company_id ? '❌ RLS DISABLED (Needs RLS!)' : 'ℹ️ RLS DISABLED (No company_id)');
      
      console.log(`Table: "${row.table_name}"`);
      console.log(` - Has company_id: ${row.has_company_id ? 'Yes' : 'No'}`);
      console.log(` - Status: ${status}`);
      console.log(` - Policies: ${row.policies || 'None'}`);
      console.log('----------------------------------------------------');

      if (row.rls_enabled) {
        securedCount++;
      } else if (row.has_company_id) {
        alertCount++;
      } else {
        ignoredCount++;
      }
    }

    console.log('\n--- Summary ---');
    console.log(`✅ Secured tables: ${securedCount}`);
    console.log(`⚠️ Unsecured tables (with company_id): ${alertCount}`);
    console.log(`ℹ️ System/Global tables (without company_id): ${ignoredCount}`);

  } catch (error) {
    console.error('Audit failed:', error);
  }
  process.exit(0);
}

main();
