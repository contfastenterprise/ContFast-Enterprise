import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const users = await sql`
      SELECT u.id, u.name, u.email, u.role_id, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id
    `;
    console.log('Users in DB:', users);
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await sql.end();
  }
}

run();
