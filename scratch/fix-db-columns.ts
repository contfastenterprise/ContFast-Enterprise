import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env loaded natively.');
} catch (e) {
  console.log('.env loading bypassed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  console.log('--- FORCING COLUMN ALTERS ---');
  const sql = postgres(connectionString, { prepare: false });
  try {
    // Try adding avatar_url
    try {
      await sql`ALTER TABLE "users" ADD COLUMN "avatar_url" text`;
      console.log('Successfully added avatar_url column to users table.');
    } catch (e: any) {
      console.log('avatar_url check:', e.message);
    }

    // Try adding avatar_path
    try {
      await sql`ALTER TABLE "users" ADD COLUMN "avatar_path" text`;
      console.log('Successfully added avatar_path column to users table.');
    } catch (e: any) {
      console.log('avatar_path check:', e.message);
    }
  } catch (err) {
    console.error('Error modifying database:', err);
  } finally {
    await sql.end();
  }
}

run();
