const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
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
  console.log('Applying migration: add indicador_nota_credito column...');
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS indicador_nota_credito integer`;
  console.log('Migration applied successfully!');

  // Verify column exists
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'indicador_nota_credito'
  `;
  console.log('Column check:', cols);
  await sql.end();
}

run().catch(console.error);
