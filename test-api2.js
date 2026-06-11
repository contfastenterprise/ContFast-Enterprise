async function test() {
  const rnc = '130902417';
  const endpoint = `https://dgiiapicloud.com/rnc/${rnc}`;

  try {
    console.log(`Testing ${endpoint}...`);
    const res = await fetch(endpoint, {
      headers: {
        'Authorization': 'Bearer mcp_public_41efc1f226064433ae482f62f1c3b9ae',
        'Accept': 'application/json'
      }
    });
    console.log(`Status: ${res.status}, Type: ${res.headers.get('content-type')}`);
    const text = await res.text();
    console.log(`Data: ${text.substring(0, 300)}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
test();
