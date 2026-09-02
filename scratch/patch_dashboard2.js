const fs = require('fs');

let content = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');

if (!content.includes('const [currentPage')) {
  content = content.replace(
    "const [searchQuery, setSearchQuery] = useState('');",
    "const [searchQuery, setSearchQuery] = useState('');\n  const [currentPage, setCurrentPage] = useState(1);\n  const itemsPerPage = 5;"
  );
}

content = content.replace(
  "setSearchQuery(e.target.value)",
  "setSearchQuery(e.target.value); setCurrentPage(1);"
);

if (!content.includes('const displayedInvoices')) {
  // Regex to safely find the filteredInvoices definition
  const filterRegex = /(const filteredInvoices = recentInvoices\.filter\([\s\S]*?\);)/;
  content = content.replace(filterRegex, `$1\n\n  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;\n  const displayedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);`);
}

content = content.replace(
  "filteredInvoices.length === 0",
  "displayedInvoices.length === 0"
);
content = content.replace(
  "filteredInvoices.map((inv",
  "displayedInvoices.map((inv"
);

const oldPagination = `<button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Anterior</button>
              <button className="px-3 py-1.5 h-8 text-xs rounded-lg bg-primary text-on-primary shadow-md shadow-primary/20 transition font-bold">1</button>
              <button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Siguiente</button>`;

const newPagination = `<button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button className="px-3 py-1.5 h-8 text-xs rounded-lg bg-primary text-on-primary shadow-md shadow-primary/20 transition font-bold">
                {currentPage} de {totalPages}
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>`;

content = content.replace(oldPagination, newPagination);

fs.writeFileSync('src/app/dashboard/page.tsx', content, 'utf8');
console.log('Successfully patched!');
