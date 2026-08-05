'use client';

import React, { useState } from 'react';
import { 
  flexRender, getCoreRowModel, useReactTable, getSortedRowModel, getFilteredRowModel, getPaginationRowModel
} from '@tanstack/react-table';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Download, Printer, Filter } from 'lucide-react';
import { Card } from "@/components/ui/card";

const fmt = (val: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

export default function ListTab({ data, companyInfo }: { data: any[], companyInfo?: any }) {
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = [
    {
      accessorKey: 'id',
      header: 'ID Factura',
      cell: ({ row }: any) => <span className="font-medium text-xs">CXP-{row.original.id.split('-')[0].toUpperCase()}</span>,
    },
    {
      accessorKey: 'supplierName',
      header: ({ column }: any) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-ml-4">
            Suplidor
            {column.getIsSorted() === "asc" ? <ChevronUp className="ml-2 h-4 w-4" /> : column.getIsSorted() === "desc" ? <ChevronDown className="ml-2 h-4 w-4" /> : <ChevronsUpDown className="ml-2 h-4 w-4 text-neutral-400" />}
          </Button>
        )
      },
      cell: ({ row }: any) => <span className="font-semibold">{row.original.supplierName}</span>,
    },
    {
      accessorKey: 'dueDate',
      header: 'Vencimiento',
      cell: ({ row }: any) => {
        const date = new Date(row.original.dueDate);
        return <span>{date.toLocaleDateString('es-DO')}</span>;
      },
    },
    {
      id: 'diasVencidos',
      header: 'Días',
      cell: ({ row }: any) => {
        const due = new Date(row.original.dueDate);
        due.setHours(0,0,0,0);
        const now = new Date();
        now.setHours(0,0,0,0);
        const diffTime = now.getTime() - due.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (row.original.balance <= 0) return <span className="text-emerald-500">-</span>;
        if (diffDays > 0) return <span className="text-rose-500 font-bold">+{diffDays}</span>;
        if (diffDays === 0) return <span className="text-amber-500 font-bold">Hoy</span>;
        return <span className="text-neutral-500">{diffDays}</span>;
      },
    },
    {
      accessorKey: 'amount',
      header: () => <div className="text-right">Monto Original</div>,
      cell: ({ row }: any) => <div className="text-right text-neutral-500">{fmt(row.original.amount)}</div>,
    },
    {
      accessorKey: 'balance',
      header: ({ column }: any) => {
        return (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-mr-4">
              Saldo Pendiente
              {column.getIsSorted() === "asc" ? <ChevronUp className="ml-2 h-4 w-4" /> : column.getIsSorted() === "desc" ? <ChevronDown className="ml-2 h-4 w-4" /> : <ChevronsUpDown className="ml-2 h-4 w-4 text-neutral-400" />}
            </Button>
          </div>
        )
      },
      cell: ({ row }: any) => <div className="text-right font-bold">{fmt(row.original.balance)}</div>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }: any) => {
        const bal = row.original.balance;
        const status = bal <= 0 ? 'Pagado' : (new Date(row.original.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) ? 'Vencida' : 'Pendiente');
        
        const variants: any = {
          'Pagado': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
          'Vencida': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
          'Pendiente': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
        };
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${variants[status]}`}>
            {status}
          </span>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Cuentas por Pagar</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #171717; margin: 1rem; }
            h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; color: #0f172a; }
            .header { margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; }
            .header-info { flex: 1; }
            .header-logo { max-height: 40px; max-width: 150px; object-fit: contain; }
            .date { color: #64748b; font-size: 0.75rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.75rem; }
            th { background-color: #f8fafc; color: #334155; font-weight: 600; text-align: left; padding: 0.35rem 0.5rem; border-bottom: 2px solid #e2e8f0; }
            td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #e2e8f0; color: #334155; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .col-id { width: 15%; white-space: nowrap; }
            .col-supplier { width: 32%; }
            .col-date { width: 10%; white-space: nowrap; }
            .col-days { width: 10%; }
            .col-amount { width: 13%; }
            .col-status { width: 7%; }
            .summary { margin-top: 1rem; font-size: 1rem; font-weight: 700; text-align: right; padding-top: 0.5rem; border-top: 2px solid #e2e8f0; }
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
            <div class="header-info">
              <h1>Reporte de Cuentas por Pagar</h1>
              <div class="date">Generado el: ${new Date().toLocaleString('es-DO')}</div>
            </div>
            ${companyInfo?.logoUrl 
              ? `<img src="${companyInfo.logoUrl}" class="header-logo" alt="Logo" />`
              : `<div style="font-weight: bold; font-size: 1.25rem; color: #475569;">${companyInfo?.name || 'Empresa'}</div>`
            }
          </div>
          <table>
            <thead>
              <tr>
                <th class="col-id">Factura/Ref</th>
                <th class="col-supplier">Suplidor</th>
                <th class="col-date">Vencimiento</th>
                <th class="text-center col-days">Días Venc.</th>
                <th class="text-right col-amount">Original</th>
                <th class="text-right col-amount">Balance</th>
                <th class="text-center col-status">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${data.filter(d => !globalFilter || d.supplierName?.toLowerCase().includes(globalFilter.toLowerCase())).map(item => {
                const due = new Date(item.dueDate); due.setHours(0,0,0,0);
                const now = new Date(); now.setHours(0,0,0,0);
                const diffDays = Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = diffDays > 0;
                const isPaid = Number(item.balance) <= 0;
                const statusStr = isPaid ? 'Pagado' : (isOverdue ? 'Vencida' : 'Pendiente');
                const statusClass = isPaid ? 'status-aldia' : (isOverdue ? 'status-vencida' : 'status-aldia');
                
                return `
                  <tr>
                    <td>CXP-${item.id.split('-')[0].toUpperCase()}</td>
                    <td><strong>${item.supplierName}</strong></td>
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
            Total Balance Pendiente: ${fmt(data.filter(d => !globalFilter || d.supplierName?.toLowerCase().includes(globalFilter.toLowerCase())).reduce((acc, curr) => acc + Number(curr.balance), 0))}
          </div>
          <script>
            window.onload = () => {
              window.print();
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
    const headers = ['Factura/Ref', 'Suplidor', 'Fecha Vencimiento', 'Dias Vencidos', 'Monto Original', 'Balance Pendiente', 'Estado'];
    
    const rows = data.filter(d => !globalFilter || d.supplierName?.toLowerCase().includes(globalFilter.toLowerCase())).map(item => {
      const due = new Date(item.dueDate);
      due.setHours(0,0,0,0);
      const now = new Date();
      now.setHours(0,0,0,0);
      const diffDays = Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const status = Number(item.balance) <= 0 ? 'Pagado' : (diffDays > 0 ? 'Vencida' : 'Pendiente');
      
      return [
        `CXP-${item.id.split('-')[0].toUpperCase()}`,
        `"${item.supplierName}"`,
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
    link.setAttribute('download', 'Cuentas_por_Pagar.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="border-outline-variant/30 shadow-sm bg-surface-bright">
      <div className="p-4 border-b border-outline-variant/20 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input 
            placeholder="Buscar suplidor, factura..." 
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 bg-white dark:bg-surface-dark"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder="Buscar suplidor, factura..."]')?.focus()}>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-neutral-500 bg-surface-container-low dark:bg-surface-dark-bright border-b border-outline-variant/20 uppercase">
            {table.getHeaderGroups().map((headerGroup: any) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header: any) => (
                  <th key={header.id} className="px-6 py-3 font-semibold whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row: any) => (
                <tr key={row.id} className="bg-white dark:bg-surface-dark border-b border-outline-variant/10 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  {row.getVisibleCells().map((cell: any) => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-neutral-500">
                  No se encontraron resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-outline-variant/20 flex items-center justify-between">
        <span className="text-sm text-neutral-500">
          Mostrando {table.getRowModel().rows.length} de {data.length} cuentas por pagar
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Siguiente
          </Button>
        </div>
      </div>
    </Card>
  );
}
