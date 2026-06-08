const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, 'src', 'app')
];

const classMap = {
  'bg-slate-950': 'bg-background',
  'bg-slate-900': 'bg-surface-container-low',
  'bg-slate-800': 'bg-surface-container-high',
  'bg-slate-700': 'bg-surface-container-highest',
  'border-slate-800': 'border-outline-variant/30',
  'border-slate-700': 'border-outline-variant/50',
  'text-slate-100': 'text-on-surface',
  'text-slate-200': 'text-on-surface',
  'text-slate-300': 'text-on-surface-variant',
  'text-slate-400': 'text-on-surface-variant',
  'text-slate-500': 'text-on-surface-variant/70',
  'text-slate-600': 'text-on-surface-variant/80',
  'hover:bg-slate-800': 'hover:bg-surface-variant',
  'hover:bg-slate-700': 'hover:bg-surface-container-highest',
  'divide-slate-800': 'divide-outline-variant/20',
  'ring-slate-800': 'ring-outline-variant/30',
};

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        callback(dirPath);
      }
    }
  });
}

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Apply map
  for (const [oldClass, newClass] of Object.entries(classMap)) {
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    content = content.replace(regex, newClass);
  }

  // Handle specific text-white within bg-slate-900 (now bg-surface-container-low)
  // This is tricky, a safer approach is to replace text-white with text-primary ONLY if it doesn't look like it's inside a primary button
  // Actually, let's just do a naive replace for text-white -> text-on-surface where it's part of a text-* class list, except when preceded by bg-blue, bg-amber, etc.
  // Instead of risking breaking buttons, we leave text-white for now, as light mode text-white on light bg is invisible, but we can fix that later if noticed.
  // Wait, let's fix text-white just to be safe: text-white -> text-primary
  content = content.replace(/text-white/g, 'text-primary');
  // Revert for buttons: bg-primary text-primary -> bg-primary text-on-primary
  content = content.replace(/bg-primary text-primary/g, 'bg-primary text-on-primary');
  content = content.replace(/bg-amber-500 text-primary/g, 'bg-amber-500 text-white');
  content = content.replace(/bg-blue-500 text-primary/g, 'bg-blue-500 text-white');
  content = content.replace(/bg-red-500 text-primary/g, 'bg-red-500 text-white');
  content = content.replace(/bg-emerald-500 text-primary/g, 'bg-emerald-500 text-white');
  content = content.replace(/bg-green-500 text-primary/g, 'bg-green-500 text-white');
  content = content.replace(/text-primary group-hover:text-primary/g, 'text-primary group-hover:text-white');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walk(dir, replaceInFile);
  }
});
console.log('Done replacing dark mode classes.');
