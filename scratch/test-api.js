async function test() {
  const rnc = '130902417';
  const endpoints = [
    `https://dgiiapicloud.com/api/v1/rnc/${rnc}`,
    `https://dgiiapicloud.com/api/rnc/${rnc}`,
    `https://dgiiapicloud.com/api/consulta/${rnc}`,
    `https://api.dgiiapicloud.com/v1/rnc/${rnc}`
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': 'Bearer mcp_public_41efc1f226064433ae482f62f1c3b9ae',
          'Accept': 'application/json'
        }
      });
      console.log(`Status: ${res.status}, Type: ${res.headers.get('content-type')}`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const text = await res.text();
        console.log(`SUCCESS! Data: ${text.substring(0, 200)}`);
        return;
      }
    } catch (e) {
      console.log(`Error on ${endpoint}: ${e.message}`);
    }
  }
}
test();
