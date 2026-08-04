const http = require('http');

http.get('http://localhost:3000/api/v1/reports/balances/customers?customerId=all', {
  headers: {
    // Assuming we need auth, but if we don't have auth in script it might fail.
    // Let's just create a test function in the next.js app to run
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
