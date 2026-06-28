import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const mappings = await sql`
      SELECT id, route_pattern, module, action, is_menu_item, display_name, group_name 
      FROM route_mappings 
      WHERE group_name = 'Sistema' OR route_pattern LIKE '%settings%' OR route_pattern LIKE '%admin%' OR route_pattern LIKE '%ecf%'
    `;
    console.log('System Route Mappings in DB:', mappings);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}
run();
