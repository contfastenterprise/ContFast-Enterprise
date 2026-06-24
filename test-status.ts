require('ts-node').register({ transpileOnly: true });

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

const { MSellerClient } = require('./src/services/dgii/msellerClient.ts');

async function run() {
  const client = new MSellerClient();
  const res16 = await client.getDocumentStatus('E340000000016');
  console.log("=== E340000000016 ===");
  console.log(JSON.stringify(res16, null, 2));

  const res18 = await client.getDocumentStatus('E340000000018');
  console.log("=== E340000000018 ===");
  console.log(JSON.stringify(res18, null, 2));

  const res19 = await client.getDocumentStatus('E340000000019');
  console.log("=== E340000000019 ===");
  console.log(JSON.stringify(res19, null, 2));
}

run().catch(console.error);
