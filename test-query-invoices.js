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
  // Check E340000000019
  const inv = await sql`
    SELECT id, ncf, ecf_type, status, indicador_nota_credito, dgii_message, modified_ncf, mseller_track_id, created_at
    FROM invoices
    WHERE ncf = 'E340000000019'
    LIMIT 1;
  `;
  console.log("=== E340000000019 ===");
  console.log(JSON.stringify(inv[0] || "NOT FOUND", null, 2));

  // Also check E340000000018 and E340000000017 to see the pattern
  const recent = await sql`
    SELECT ncf, ecf_type, status, indicador_nota_credito, dgii_message, modified_ncf, created_at
    FROM invoices
    WHERE ecf_type = '34'
    ORDER BY created_at DESC
    LIMIT 5;
  `;
  console.log("\n=== Recent e-34 notes ===");
  recent.forEach(r => console.log(JSON.stringify(r)));
  
  await sql.end();
}

run().catch(console.error);
