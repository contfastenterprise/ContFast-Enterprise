const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const dns = await sql`
    SELECT id, delivery_number, status, delivery_date, driver_name, company_id
    FROM delivery_notes;
  `;
  console.log("DELIVERY NOTES:", dns);

  const invs = await sql`
    SELECT id, ncf, ecf_type, status, delivery_status, company_id
    FROM invoices
    LIMIT 10;
  `;
  console.log("INVOICES:", invs);
  await sql.end();
}

run().catch(console.error);
