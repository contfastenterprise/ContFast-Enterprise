const fs = require('fs');

let content = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');

if (!content.includes('import { ScrollReveal }')) {
  content = content.replace("import { ArrowUpRight", "import { ScrollReveal } from '@/components/ui/ScrollReveal';\nimport { ArrowUpRight");
}

const section1Regex = /(<section className="grid grid-cols-1 md:grid-cols-4 gap-6">[\s\S]*?<\/section>)/;
content = content.replace(section1Regex, '<ScrollReveal>$1</ScrollReveal>');

const section2Regex = /(<section className="bg-white\/70 backdrop-blur-md border border-white\/40 shadow-\[0_4px_30px_rgba\(0,0,0,0\.05\)\] rounded-xl overflow-hidden">[\s\S]*?<\/section>)/;
content = content.replace(section2Regex, '<ScrollReveal delay={0.1}>$1</ScrollReveal>');

fs.writeFileSync('src/app/dashboard/page.tsx', content, 'utf8');
console.log('Wrapped sections successfully');
