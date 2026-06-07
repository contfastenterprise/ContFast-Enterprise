import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Load the local .env file using Node's native process.loadEnvFile
try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env file loaded successfully.');
} catch (e) {
  console.warn('.env file not loaded natively, using existing process.env variables.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('DIRECT_DATABASE_URL or DATABASE_URL environment variable is missing');
  process.exit(1);
}

async function main() {
  console.log('Starting database migrations on Supabase...');
  console.log(`Connecting to: ${connectionString.split('@')[1]}`); // Log only host details for safety

  const migrationClient = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(migrationClient);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Database migrations completed successfully!');
  } catch (error) {
    console.error('Error executing migrations:', error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

main();
