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

const baseUrl = 'https://ecf.api.mseller.app';
const apiKey = process.env.NEXT_PUBLIC_MSELLER_API_KEY || process.env.MSELLER_API_KEY;
const entorno = process.env.NEXT_PUBLIC_MSELLER_ENV || 'TesteCF';

async function auth() {
  const clientId = process.env.MSELLER_CLIENT_ID || process.env.NEXT_PUBLIC_MSELLER_CLIENT_ID;
  const secret = process.env.MSELLER_CLIENT_SECRET || process.env.NEXT_PUBLIC_MSELLER_CLIENT_SECRET;
  const res = await fetch(`${baseUrl}/${entorno}/customer/authentication`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    },
    body: JSON.stringify({
      username: clientId,
      password: secret
    })
  });
  const data = await res.json();
  return data.idToken;
}

async function getStatus(ncf, token) {
  const url = `${baseUrl}/${entorno}/documentos-ecf?ecf=${encodeURIComponent(ncf)}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-API-KEY': apiKey
    }
  });
  return res.json();
}

async function run() {
  const token = await auth();
  
  for (const ncf of ['E340000000016', 'E340000000018', 'E340000000019']) {
    console.log(`\n=== ${ncf} ===`);
    const data = await getStatus(ncf, token);
    console.log(JSON.stringify(data, null, 2));
  }
}

run().catch(console.error);
