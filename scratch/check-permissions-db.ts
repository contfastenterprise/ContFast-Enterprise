import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const perms = await sql`SELECT module, action FROM permissions ORDER BY module, action`;
    console.log('Permissions in DB:');
    perms.forEach((p: any) => console.log(`  ${p.module}:${p.action}`));
    
    const modules = await sql`SELECT DISTINCT module FROM route_mappings ORDER BY module`;
    console.log('\nDistinct modules in route_mappings:');
    modules.forEach((m: any) => console.log(`  ${m.module}`));
  } finally {
    await sql.end();
  }
}
run();
