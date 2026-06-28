const postgres = require('postgres');

// Load environment variables
try {
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('Natively loaded or no .env needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing connection string in environment variables.');
  process.exit(1);
}

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { prepare: false });

  try {
    // 1. invoices.modified_invoice_id -> invoices.id
    console.log('Checking existing constraints on invoices...');
    const invoiceConstraints = await sql`
      SELECT conname, pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conrelid = 'invoices'::regclass;
    `;
    
    const hasInvoiceFk = invoiceConstraints.some(c => c.conname === 'invoices_modified_invoice_id_invoices_id_fk');
    if (!hasInvoiceFk) {
      console.log('Adding missing foreign key constraint: invoices_modified_invoice_id_invoices_id_fk');
      await sql`
        ALTER TABLE "invoices" 
        ADD CONSTRAINT "invoices_modified_invoice_id_invoices_id_fk" 
        FOREIGN KEY ("modified_invoice_id") 
        REFERENCES "invoices"("id") 
        ON DELETE restrict ON UPDATE no action;
      `;
      console.log('Invoices constraint added successfully.');
    } else {
      console.log('Invoices foreign key constraint already exists.');
    }

    // 2. chart_of_accounts.parent_id -> chart_of_accounts.id
    console.log('Checking existing constraints on chart_of_accounts...');
    const chartConstraints = await sql`
      SELECT conname, pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conrelid = 'chart_of_accounts'::regclass;
    `;
    
    const hasChartFk = chartConstraints.some(c => c.conname === 'chart_of_accounts_parent_id_chart_of_accounts_id_fk');
    if (!hasChartFk) {
      console.log('Adding missing foreign key constraint: chart_of_accounts_parent_id_chart_of_accounts_id_fk');
      await sql`
        ALTER TABLE "chart_of_accounts" 
        ADD CONSTRAINT "chart_of_accounts_parent_id_chart_of_accounts_id_fk" 
        FOREIGN KEY ("parent_id") 
        REFERENCES "chart_of_accounts"("id") 
        ON DELETE restrict ON UPDATE no action;
      `;
      console.log('Chart of Accounts constraint added successfully.');
    } else {
      console.log('Chart of Accounts foreign key constraint already exists.');
    }

  } catch (err) {
    console.error('Failed to run migration:', err);
  } finally {
    await sql.end();
  }
}

run();
