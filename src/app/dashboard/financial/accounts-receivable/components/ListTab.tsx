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
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filtros
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
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
