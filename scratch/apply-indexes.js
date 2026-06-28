const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Manually parse .env
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length > 1) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (err) {
  console.error('Error loading .env manually:', err);
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const sql = postgres(connectionString, { ssl: 'require', idle_timeout: 10 });

async function run() {
  try {
    console.log('Applying index migrations to database...');

    console.log('1. Creating expense_comp_issue_date_idx...');
    await sql`CREATE INDEX IF NOT EXISTS "expense_comp_issue_date_idx" ON "expenses" ("company_id", "issue_date")`;

    console.log('2. Creating invoices_comp_status_created_idx...');
    await sql`CREATE INDEX IF NOT EXISTS "invoices_comp_status_created_idx" ON "invoices" ("company_id", "status", "created_at")`;

    console.log('3. Creating journal_entries_comp_status_date_idx...');
    await sql`CREATE INDEX IF NOT EXISTS "journal_entries_comp_status_date_idx" ON "journal_entries" ("company_id", "status", "date")`;

    console.log('4. Creating journal_entry_lines_comp_acc_idx...');
    await sql`CREATE INDEX IF NOT EXISTS "journal_entry_lines_comp_acc_idx" ON "journal_entry_lines" ("company_id", "account_id")`;

    console.log('All indexes created successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

run();
