const https = require('https');

async function testAll() {
  const rnc = '130902417';
  const token = 'mcp_public_41efc1f226064433ae482f62f1c3b9ae';
  const url = `https://dgiiapicloud.com/rnc/${rnc}`;
  
  const variations = [
    { headers: { 'Authorization': `Bearer ${token}` } },
    { headers: { 'x-api-key': token } },
    { headers: { 'token': token } },
    { headers: { 'Authorization': token } },
  ];

  for (const v of variations) {
    console.log(`Testing with headers:`, v.headers);
    try {
      const res = await fetch(url, {
        headers: { ...v.headers, 'Accept': 'application/json' }
      });
      const ct = res.headers.get('content-type');
      console.log(`Status: ${res.status}, Content-Type: ${ct}`);
      if (ct && ct.includes('application/json')) {
        const text = await res.text();
        console.log(`SUCCESS! JSON: ${text.substring(0,200)}`);
        return;
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

testAll();
