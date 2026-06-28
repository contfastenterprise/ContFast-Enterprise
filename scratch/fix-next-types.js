const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const appDir = path.join(__dirname, '..', 'src', 'app');
console.log('Scanning app directory:', appDir);

let count = 0;
walkDir(appDir, (filePath) => {
  if (path.basename(filePath) === 'route.ts') {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Regex to match params: Promise<{ ... }> or params: Promise<{ ... }>
    // We want to handle multiline signatures or simple ones
    const regex1 = /params:\s*Promise<\{[^\}]+\}>/g;
    const regex2 = /segmentData:\s*\{\s*params:\s*Promise<\{[^\}]+\}>\s*\}/g;
    
    let modified = false;
    
    if (regex1.test(content)) {
      content = content.replace(regex1, 'params: Promise<any>');
      modified = true;
    }
    
    if (regex2.test(content)) {
      content = content.replace(regex2, 'segmentData: { params: Promise<any> }');
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated: ${path.relative(path.join(__dirname, '..'), filePath)}`);
      count++;
    }
  }
});

console.log(`Finished. Updated ${count} route files.`);
