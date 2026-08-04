'use client';

import React, { useState } from 'react';
import { 
  flexRender, getCoreRowModel, useReactTable, getSortedRowModel, getFilteredRowModel, getPaginationRowModel
} from '@tanstack/react-table';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Download } from 'lucide-react';
import { Card } from "@/components/ui/card";

const fmt = (val: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

export default function ListTab({ data }: { data: any[] }) {
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
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Download className="w-4 h-4 mr-2" /> Exportar
        </Button>
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
