import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const mappings = await sql`SELECT count(*)::int as count FROM route_mappings`;
    console.log('Route mappings count:', mappings[0].count);
    
    const sample = await sql`SELECT * FROM route_mappings LIMIT 5`;
    console.log('Sample mappings:', sample);

    const rolesCount = await sql`SELECT count(*)::int as count FROM roles`;
    console.log('Roles count:', rolesCount[0].count);

    const rolesSample = await sql`SELECT * FROM roles LIMIT 5`;
    console.log('Sample roles:', rolesSample);
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await sql.end();
  }
}

run();
