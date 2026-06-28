const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api', 'v1');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file === 'route.ts' || file === 'route.js') {
      callback(fullPath);
    }
  }
}

const targetString = "await checkRateLimit(ip, 'standard');";
const replacementString = `const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }`;

let modifiedCount = 0;

console.log('Starting automated refactoring for rate limiting...');

walkDir(API_DIR, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes(targetString)) {
    // Avoid double refactoring if run twice
    if (content.includes("const allowed = await checkRateLimit(ip, 'standard');")) {
      console.log(`[SKIPPED] Already refactored: ${filePath}`);
      return;
    }
    
    // Replace all occurrences of targetString
    content = content.split(targetString).join(replacementString);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[MODIFIED] Refactored checkRateLimit in: ${filePath}`);
    modifiedCount++;
  }
});

console.log(`\nRefactoring completed successfully. Total files modified: ${modifiedCount}`);
