const https = require('https');

async function testEndpoints() {
  const rnc = '130902417';
  const token = 'mcp_public_41efc1f226064433ae482f62f1c3b9ae';
  
  const endpoints = [
    `https://dgiiapicloud.com/api/validate/rnc/${rnc}`,
    `https://dgiiapicloud.com/validate/rnc/${rnc}`,
    `https://dgiiapicloud.com/api/rnc/${rnc}`,
    `https://dgiiapicloud.com/api/v1/rnc/${rnc}`,
    `https://dgiiapicloud.com/api/v1/validate/rnc/${rnc}`,
    `https://api.dgiiapicloud.com/validate/rnc/${rnc}`,
    `https://api.dgiiapicloud.com/v1/rnc/${rnc}`,
    `https://dgiiapicloud.com/rnc/${rnc}` // user's suggestion
  ];

  for (const url of endpoints) {
    console.log(`\nTesting: ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      const contentType = res.headers.get('content-type') || '';
      console.log(`Status: ${res.status}, Content-Type: ${contentType}`);
      
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.text();
        console.log(`[SUCCESS] JSON Data: ${data.substring(0, 300)}`);
        return;
      } else {
        console.log(`Failed or not JSON.`);
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testEndpoints();
