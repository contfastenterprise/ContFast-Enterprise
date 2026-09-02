const fs = require('fs');

let content = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');

content = content.replace(
  "const [searchQuery, setSearchQuery] = useState('');",
  "const [searchQuery, setSearchQuery] = useState('');\n  const [currentPage, setCurrentPage] = useState(1);\n  const itemsPerPage = 6;"
);

content = content.replace(
  "setSearchQuery(e.target.value)",
  "setSearchQuery(e.target.value); setCurrentPage(1);"
);

const filterStr = `  const filteredInvoices = recentInvoices.filter(inv =>
    inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );`;

const newFilterStr = `  const filteredInvoices = recentInvoices.filter(inv =>
    inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
  const displayedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);`;

content = content.replace(filterStr, newFilterStr);

content = content.replace(
  "filteredInvoices.length === 0",
  "displayedInvoices.length === 0"
);
content = content.replace(
  "filteredInvoices.map((inv",
  "displayedInvoices.map((inv"
);

const paginationUI = `<button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Anterior</button>
              <button className="px-3 py-1.5 h-8 text-xs rounded-lg bg-primary text-on-primary shadow-md shadow-primary/20 transition font-bold">1</button>
              <button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Siguiente</button>`;

const newPaginationUI = `<button 
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

content = content.replace(paginationUI, newPaginationUI);

fs.writeFileSync('src/app/dashboard/page.tsx', content, 'utf8');
console.log('Dashboard patched!');
