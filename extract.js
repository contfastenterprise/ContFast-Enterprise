const fs = require('fs');
const js = fs.readFileSync('index.js', 'utf8');
const urls = js.match(/https:\/\/[A-Za-z0-9\-\.]+/g);
if(urls) {
  const unique = [...new Set(urls)];
  console.log(unique);
}
