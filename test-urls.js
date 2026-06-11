async function testAll() {
  const rnc = '130902417';
  const token = 'dgii_b76383a9adce413fb82e0f58ec206f71';
  const urls = [
    `https://api.dgiiapicloud.com/v1/rnc/${rnc}`,
    `https://api.dgiicloud.com/v1/rnc/${rnc}`,
    `https://api.dgii.cloud/v1/rnc/${rnc}`
  ];
  
  for (const url of urls) {
    console.log(`Testing URL: ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'x-api-key': token }
      });
      const ct = res.headers.get('content-type');
      console.log(`Status: ${res.status}, Content-Type: ${ct}`);
      if (ct && ct.includes('application/json')) {
        const text = await res.text();
        console.log(`SUCCESS! JSON: ${text.substring(0,200)}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

testAll();
