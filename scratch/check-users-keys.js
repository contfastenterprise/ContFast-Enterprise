const postgres = require('postgres');
try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const dbUsers = await sql`
      SELECT id, name, email, avatar_url, avatar_path
      FROM users
      WHERE email = 'contfastenterprise@gmail.com'
    `;
    console.log('Gerson DB Record:', dbUsers[0]);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}
run();
