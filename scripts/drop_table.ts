import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is missing');
}

const sql = postgres(connectionString, { max: 1 });

async function main() {
  console.log('Dropping table document_email_logs...');
  await sql`DROP TABLE IF EXISTS "document_email_logs" CASCADE`;
  console.log('Dropped successfully.');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
