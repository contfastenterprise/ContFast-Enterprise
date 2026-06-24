const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (match) {
      let value = (match[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const exps = await sql`
    SELECT id, ncf, issue_date, created_at, amount, is_minor_expense
    FROM expenses
    ORDER BY created_at DESC
    LIMIT 10;
  `;
  console.log("=== Recent Expenses ===");
  console.log(JSON.stringify(exps, null, 2));
  await sql.end();
}

run().catch(console.error);
