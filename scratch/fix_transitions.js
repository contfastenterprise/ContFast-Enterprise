const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        callback(path.join(dirPath));
      }
    }
  });
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  content = content.replace(/transition-all/g, 'transition');
  content = content.replace(/(?<!-)ease-in(?!-out)/g, 'ease-out');
  content = content.replace(/duration-500/g, 'duration-300');
  content = content.replace(/duration-700/g, 'duration-300');
  content = content.replace(/duration-1000/g, 'duration-300');
  content = content.replace(/scale-0/g, 'scale-95 opacity-0');
  
  if (original !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + filePath);
  }
}

walkDir('src', processFile);
console.log('Done!');
