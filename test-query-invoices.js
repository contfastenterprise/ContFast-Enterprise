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
  const invs = await sql`
    SELECT id, ncf, ecf_type, status, indicador_nota_credito, dgii_message, modified_ncf, created_at
    FROM invoices
    WHERE ncf = 'E340000000016';
  `;
  console.log("INVOICE E340000000016:", JSON.stringify(invs, null, 2));

  if (invs.length > 0) {
    const subs = await sql`
      SELECT response_payload
      FROM dgii_submissions
      WHERE invoice_id = ${invs[0].id}
      ORDER BY updated_at DESC LIMIT 1;
    `;
    if (subs.length > 0) {
      const payload = JSON.parse(subs[0].response_payload || '{}');
      // Print key info from the submission payload to understand what was sent
      console.log("indicadorNotaCredito sent:", payload.indicadorNotaCredito);
      console.log("status:", payload.status);
      console.log("dgiiResponse:", JSON.stringify(payload.dgiiResponse, null, 2));
    }
  }
  await sql.end();
}

run().catch(console.error);
