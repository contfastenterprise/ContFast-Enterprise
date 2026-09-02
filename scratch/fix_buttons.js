const fs = require('fs');
let content = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');

const oldBlock = `        <div className="p-4 bg-slate-50/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-xs text-slate-500/70 font-medium">Mostrando <span className="text-primary font-bold">{filteredInvoices.length}</span> de {stats.totalInvoices} registros</span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Anterior</button>
            <button className="px-3 py-1.5 h-8 text-xs rounded-lg bg-primary text-on-primary shadow-md shadow-primary/20 transition font-bold">1</button>
            <button className="px-3 py-1.5 h-8 text-xs rounded-lg border border-slate-200/30 hover:bg-white hover:shadow-sm transition font-bold text-slate-500">Siguiente</button>
          </div>
        </div>`;

const newBlock = `        <div className="p-4 bg-slate-50/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-xs text-slate-500/70 font-medium">Mostrando <span className="text-primary font-bold">{displayedInvoices.length}</span> de {filteredInvoices.length} encontrados (Total: {stats.totalInvoices})</span>
          <div className="flex gap-2">
            <button 
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
            </button>
          </div>
        </div>`;

if(content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync('src/app/dashboard/page.tsx', content, 'utf8');
  console.log("Successfully replaced exact block!");
} else {
  // try replacing CRLF with LF to match
  const contentLF = content.replace(/\r\n/g, '\n');
  if(contentLF.includes(oldBlock)) {
    content = contentLF.replace(oldBlock, newBlock);
    fs.writeFileSync('src/app/dashboard/page.tsx', content, 'utf8');
    console.log("Successfully replaced exact block (LF)!");
  } else {
    console.log("Failed to match the exact block.");
  }
}
