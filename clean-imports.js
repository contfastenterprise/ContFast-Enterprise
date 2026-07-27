const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const dashboardDir = path.join(__dirname, 'src', 'app', 'dashboard');
const files = walk(dashboardDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes("import DashboardLayout from '@/app/dashboard/layout'")) {
    console.log(`Cleaning unused layout import from: ${file}`);
    // Remove the import line
    content = content.replace(/import\s+DashboardLayout\s+from\s+['"]@\/app\/dashboard\/layout['"];?\r?\n?/g, '');
    // Also check if they wrapped the JSX with <DashboardLayout> and replace it with <Fragment> or <>
    if (content.includes('<DashboardLayout>')) {
      content = content.replace(/<DashboardLayout>/g, '<>');
      content = content.replace(/<\/DashboardLayout>/g, '</>');
    }
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log('Unused layout imports cleaned successfully!');
