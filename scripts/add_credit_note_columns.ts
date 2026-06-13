import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log('Adding columns modified_ncf and modified_invoice_id to invoices table...');
    await sql.unsafe(`
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "modified_ncf" varchar(13);
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "modified_invoice_id" uuid;
    `);
    console.log('Columns added successfully.');
  } catch (error) {
    console.error('Failed to add columns:', error);
  } finally {
    await sql.end();
  }
}

main();
