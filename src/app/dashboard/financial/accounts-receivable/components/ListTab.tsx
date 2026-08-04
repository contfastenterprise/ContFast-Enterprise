'use client';

import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Download, Printer, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function ListTab({ data }: { data: any[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'customerName' | 'dueDate' | 'balance' | 'status'>('dueDate');
  const [sortDesc, setSortDesc] = useState(false);

  const filteredData = useMemo(() => {
    return data
      .filter(item => {
        if (Number(item.balance) <= 0) return false; // Solo pendientes
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return item.customerName?.toLowerCase().includes(term) || item.status.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (sortField === 'balance') {
          valA = Number(valA);
          valB = Number(valB);
        }

        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
      });
  }, [data, searchTerm, sortField, sortDesc]);

  const toggleSort = (field: any) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Cuentas por Cobrar</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #171717; margin: 2rem; }
            h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #0f172a; }
            .header { margin-bottom: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; }
            .date { color: #64748b; font-size: 0.875rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.875rem; }
            th { background-color: #f8fafc; color: #334155; font-weight: 600; text-align: left; padding: 0.75rem; border-bottom: 2px solid #e2e8f0; }
            td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; color: #334155; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .summary { margin-top: 2rem; font-size: 1.125rem; font-weight: 700; text-align: right; padding-top: 1rem; border-top: 2px solid #e2e8f0; }
            .status-vencida { color: #e11d48; font-weight: 600; }
            .status-aldia { color: #059669; font-weight: 600; }
            @media print {
              body { margin: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Reporte de Cuentas por Cobrar</h1>
            <div class="date">Generado el: ${new Date().toLocaleString('es-DO')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Factura/Ref</th>
                <th>Cliente</th>
                <th>Vencimiento</th>
                <th class="text-center">Días Venc.</th>
                <th class="text-right">Original</th>
                <th class="text-right">Balance</th>
                <th class="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => {
                const due = new Date(item.dueDate); due.setHours(0,0,0,0);
                const now = new Date(); now.setHours(0,0,0,0);
                const diffDays = Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = diffDays > 0;
                const isPaid = Number(item.balance) <= 0;
                const statusStr = isPaid ? 'Pagado' : (isOverdue ? 'Vencida' : 'Al Día');
                const statusClass = isPaid ? 'status-aldia' : (isOverdue ? 'status-vencida' : 'status-aldia');
                
                return `
                  <tr>
                    <td>CXC-${item.id.split('-')[0].toUpperCase()}</td>
                    <td><strong>${item.customerName}</strong></td>
                    <td>${due.toLocaleDateString('es-DO')}</td>
                    <td class="text-center ${isOverdue ? 'status-vencida' : ''}">${isOverdue ? diffDays : '-'}</td>
                    <td class="text-right">${fmt(Number(item.amount))}</td>
                    <td class="text-right font-bold">${fmt(Number(item.balance))}</td>
                    <td class="text-center"><span class="${statusClass}">${statusStr}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="summary">
            Total Balance Pendiente: ${fmt(filteredData.reduce((acc, curr) => acc + Number(curr.balance), 0))}
          </div>
          <script>
            window.onload = () => {
              window.print();
              // No cerramos automáticamente para permitir que el usuario cancele si desea
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const headers = ['Factura/Ref', 'Cliente', 'Fecha Vencimiento', 'Dias Vencidos', 'Monto Original', 'Balance Pendiente', 'Estado'];
    const rows = filteredData.map(item => {
      const due = new Date(item.dueDate);
      due.setHours(0,0,0,0);
      const now = new Date();
      now.setHours(0,0,0,0);
      const diffDays = Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const status = Number(item.balance) <= 0 ? 'Pagado' : (diffDays > 0 ? 'Vencida' : 'Al Dia');
      
      return [
        `CXC-${item.id.split('-')[0].toUpperCase()}`,
        `"${item.customerName}"`,
        due.toLocaleDateString('es-DO'),
        diffDays > 0 ? diffDays : 0,
        item.amount || 0,
        item.balance || 0,
        status
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Cuentas_por_Cobrar.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-surface-bright dark:bg-surface-dark-bright rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="p-4 border-b border-outline-variant/20 flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-container-lowest">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input 
            placeholder="Buscar por cliente o factura..." 
            className="pl-9 bg-white dark:bg-neutral-900 border-outline-variant/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder="Buscar por cliente o factura..."]')?.focus()}>
            <Filter className="w-4 h-4" /> Filtros
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-surface-container-low text-neutral-500">
            <tr>
              <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => toggleSort('customerName')}>
                <div className="flex items-center gap-1">Cliente <ArrowUpDown className="w-3 h-3"/></div>
              </th>
              <th className="px-6 py-4 font-semibold">Factura / Ref</th>
              <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => toggleSort('dueDate')}>
                <div className="flex items-center gap-1">Vencimiento <ArrowUpDown className="w-3 h-3"/></div>
              </th>
              <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => toggleSort('balance')}>
                <div className="flex items-center justify-end gap-1"><ArrowUpDown className="w-3 h-3"/> Balance</div>
              </th>
              <th className="px-6 py-4 font-semibold text-center cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => toggleSort('status')}>
                <div className="flex items-center justify-center gap-1"><ArrowUpDown className="w-3 h-3"/> Estado</div>
              </th>
              <th className="px-6 py-4 font-semibold text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {filteredData.map((item, i) => {
              const due = new Date(item.dueDate);
              due.setHours(0,0,0,0);
              const now = new Date();
              now.setHours(0,0,0,0);
              
              const diffTime = now.getTime() - due.getTime();
              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
              const isOverdue = diffDays > 0;

              return (
                <tr key={item.id || i} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4 font-medium text-neutral-800 dark:text-neutral-200">
                    {item.customerName}
                  </td>
                  <td className="px-6 py-4 text-neutral-500">
                    {item.id.split('-')[0].toUpperCase()}
                  </td>
                  <td className="px-6 py-4 text-neutral-600">
                    {due.toLocaleDateString('es-DO')}
                    {isOverdue && <span className="ml-2 text-xs text-rose-500 font-medium">({diffDays} días)</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                    {fmt(Number(item.balance))}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {isOverdue ? (
                      <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 rounded-full text-xs font-semibold">Vencida</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-semibold">Al Día</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Button variant="ghost" size="sm" className="text-primary h-8">Ver Detalle</Button>
                  </td>
                </tr>
              )
            })}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                  No se encontraron registros que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Footer */}
      <div className="p-4 border-t border-outline-variant/20 flex justify-between items-center text-sm text-neutral-500 bg-surface-container-lowest">
        <div>Mostrando {filteredData.length} registros</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Anterior</Button>
          <Button variant="outline" size="sm" disabled>Siguiente</Button>
        </div>
      </div>
    </div>
  );
}
