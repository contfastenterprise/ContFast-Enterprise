'use client';

/**
 * La tabla de cartera, una sola para cobrar y para pagar (auditoria P2-36).
 *
 * QUE HABIA ANTES
 * ---------------
 * Dos `ListTab.tsx` que hacian lo mismo de forma distinta: cobrar a mano con
 * `useMemo` y un `sort` propio, pagar con `@tanstack/react-table`. No era solo
 * estilo -- habian DIVERGIDO en comportamiento, que es el riesgo que la
 * auditoria nombraba:
 *
 *   - cobrar escondia las cuentas saldadas; pagar las enseñaba;
 *   - cobrar contaba los dias desde la EMISION y titulaba la columna
 *     "Dias Venc."; pagar los contaba desde el VENCIMIENTO;
 *   - la paginacion de cobrar era un adorno: los dos botones `disabled` fijos
 *     y "Mostrando N registros" con N = el total, asi que con 500 facturas
 *     pintaba las 500 y aparentaba paginar.
 *
 * COMO SE RESOLVIO CADA UNA
 * -------------------------
 *   saldadas   un interruptor, ocultas por defecto. Se entra aqui a ver lo que
 *              se debe; quien necesite el historial lo pide.
 *   dias       DOS columnas con su nombre correcto. Antiguedad (desde la
 *              emision) y Atraso (desde el vencimiento) son cifras distintas y
 *              las dos se usan: llamarlas igual era lo que estaba mal.
 *   paginacion real, de `getPaginationRowModel`.
 *
 * LA UNICA DIFERENCIA ENTRE LAS DOS PANTALLAS ES `tipo`
 * -----------------------------------------------------
 * Todo lo demas -- rotulos, titulo del reporte, nombre del CSV, prefijo del
 * documento -- sale de `PALABRAS[tipo]`. Es a proposito: mientras la unica
 * forma de distinguirlas sea un token, no pueden volver a divergir sin que se
 * note.
 */
import React, { useMemo, useState } from 'react';
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Download, Printer, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateDisplay, hoyDia } from '@/utils/fechasLocales';
import {
  normalizarFilas, filtrarFilas, PALABRAS,
  type FilaCuenta, type TipoCuenta,
} from '@/services/cartera/documentos';

// El formateador se construye UNA vez, no en cada llamada. Con 25 filas y dos
// columnas de dinero eran 50 `Intl.NumberFormat` por pintada, mas los del papel
// y el CSV. react-doctor lo marca como `js-hoist-intl`, y lo marcaba en las
// cuatro pantallas de esta carpeta.
const PESOS = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' });
const fmt = (val: number) => PESOS.format(val || 0);

const ESTADOS: Record<FilaCuenta['estado'], { texto: string; clase: string }> = {
  'pagado': { texto: 'Pagado', clase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  'vencida': { texto: 'Vencida', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  'al-dia': { texto: 'Al día', clase: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
};

function Ordenable({ column, children, alDerecha = false }: any) {
  const dir = column.getIsSorted();
  return (
    <div className={alDerecha ? 'flex justify-end' : ''}>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(dir === 'asc')}
        className={alDerecha ? '-mr-4' : '-ml-4'}
      >
        {children}
        {dir === 'asc' ? <ChevronUp className="ml-2 h-4 w-4" />
          : dir === 'desc' ? <ChevronDown className="ml-2 h-4 w-4" />
          : <ChevronsUpDown className="ml-2 h-4 w-4 text-neutral-400" />}
      </Button>
    </div>
  );
}

export default function TablaCuentas({
  data, companyInfo, tipo,
}: { data: any[]; companyInfo?: any; tipo: TipoCuenta }) {
  const P = PALABRAS[tipo];
  const [busca, setBusca] = useState('');
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'atraso', desc: true }]);

  // `hoyDia()` se congela al montar. Si se llamara dentro de cada celda, una
  // pestaña abierta toda la noche cambiaria de dia a mitad de tabla y unas
  // filas contarian con un dia y otras con otro.
  const hoy = useMemo(() => hoyDia(), []);
  const todas = useMemo(() => normalizarFilas(data, tipo, hoy), [data, tipo, hoy]);
  const filas = useMemo(() => filtrarFilas(todas, busca, verSaldadas), [todas, busca, verSaldadas]);

  const saldadas = useMemo(() => todas.filter(f => f.estado === 'pagado').length, [todas]);
  const totalSaldo = useMemo(() => filas.reduce((a, f) => a + f.saldo, 0), [filas]);

  const columns = useMemo<ColumnDef<FilaCuenta>[]>(() => [
    {
      accessorKey: 'documento',
      header: 'Documento',
      cell: ({ row }) => <span className="font-medium text-xs font-mono">{row.original.documento}</span>,
    },
    {
      accessorKey: 'entidad',
      header: ({ column }) => <Ordenable column={column}>{P.entidad}</Ordenable>,
      cell: ({ row }) => <span className="font-semibold">{row.original.entidad}</span>,
    },
    {
      accessorKey: 'emision',
      header: 'Emisión',
      cell: ({ row }) => <span className="text-neutral-600">{formatDateDisplay(row.original.emision)}</span>,
    },
    {
      accessorKey: 'vencimiento',
      header: 'Vencimiento',
      cell: ({ row }) => <span className="text-neutral-600">{formatDateDisplay(row.original.vencimiento)}</span>,
    },
    {
      accessorKey: 'antiguedad',
      header: () => <div className="text-center">Antigüedad</div>,
      cell: ({ row }) => (
        <div className="text-center text-neutral-500 font-mono-data">{row.original.antiguedad} d</div>
      ),
    },
    {
      accessorKey: 'atraso',
      header: ({ column }) => <Ordenable column={column} alDerecha>Atraso</Ordenable>,
      cell: ({ row }) => {
        const f = row.original;
        // Una saldada no tiene atraso aunque su fecha pasara: enseñar el numero
        // ahi seria decir que se debe algo.
        if (f.estado === 'pagado') return <div className="text-right text-neutral-400">—</div>;
        if (f.atraso === 0) return <div className="text-right text-neutral-500">al día</div>;
        return <div className="text-right text-rose-600 font-bold font-mono-data">+{f.atraso} d</div>;
      },
    },
    {
      accessorKey: 'montoOriginal',
      header: () => <div className="text-right">Monto Original</div>,
      cell: ({ row }) => (
        <div className="text-right text-neutral-500 font-mono-data">{fmt(row.original.montoOriginal)}</div>
      ),
    },
    {
      accessorKey: 'saldo',
      header: ({ column }) => <Ordenable column={column} alDerecha>Saldo Pendiente</Ordenable>,
      cell: ({ row }) => (
        <div className="text-right font-bold font-mono-data">{fmt(row.original.saldo)}</div>
      ),
    },
    {
      accessorKey: 'estado',
      header: () => <div className="text-center">Estado</div>,
      cell: ({ row }) => {
        const e = ESTADOS[row.original.estado];
        return (
          <div className="text-center">
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${e.clase}`}>{e.texto}</span>
          </div>
        );
      },
    },
  ], [P.entidad]);

  const table = useReactTable({
    data: filas,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  // Se imprime y se exporta LO QUE SE VE, en el orden en que se ve. Si el papel
  // trajera otra cosa que la pantalla, nadie sabria cual de los dos creer.
  const visibles = (): FilaCuenta[] => table.getSortedRowModel().rows.map(r => r.original);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const filasVisibles = visibles();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${P.titulo}</title>
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
            .summary { margin-top: 1rem; font-size: 1rem; font-weight: 700; text-align: right; padding-top: 0.5rem; border-top: 2px solid #e2e8f0; }
            .vencida { color: #e11d48; font-weight: 600; }
            .aldia { color: #059669; font-weight: 600; }
            @media print { body { margin: 0; } button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-info">
              <h1>${P.titulo}</h1>
              <div class="date">Generado el: ${new Date().toLocaleString('es-DO')}${verSaldadas ? ' · incluye cuentas saldadas' : ''}</div>
            </div>
            ${companyInfo?.logoUrl
              ? `<img src="${companyInfo.logoUrl}" class="header-logo" alt="Logo" />`
              : `<div style="font-weight: bold; font-size: 1.25rem; color: #475569;">${companyInfo?.name || 'Empresa'}</div>`}
          </div>
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>${P.entidad}</th>
                <th>Emisión</th>
                <th>Vencimiento</th>
                <th class="text-center">Antigüedad</th>
                <th class="text-center">Atraso</th>
                <th class="text-right">Original</th>
                <th class="text-right">Saldo</th>
                <th class="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${filasVisibles.map(f => `
                <tr>
                  <td>${f.documento}</td>
                  <td><strong>${f.entidad}</strong></td>
                  <td>${formatDateDisplay(f.emision)}</td>
                  <td>${formatDateDisplay(f.vencimiento)}</td>
                  <td class="text-center">${f.antiguedad} d</td>
                  <td class="text-center ${f.atraso > 0 ? 'vencida' : ''}">${f.estado === 'pagado' ? '—' : (f.atraso > 0 ? `+${f.atraso} d` : 'al día')}</td>
                  <td class="text-right">${fmt(f.montoOriginal)}</td>
                  <td class="text-right"><strong>${fmt(f.saldo)}</strong></td>
                  <td class="text-center"><span class="${f.estado === 'vencida' ? 'vencida' : 'aldia'}">${ESTADOS[f.estado].texto}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="summary">
            Total Pendiente: ${fmt(filasVisibles.reduce((a, f) => a + f.saldo, 0))}
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const cabecera = ['Documento', P.entidad, 'Fecha Emision', 'Fecha Vencimiento', 'Antiguedad_Dias', 'Atraso_Dias', 'Monto Original', 'Saldo Pendiente', 'Estado'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cuerpo = visibles().map(f => [
      esc(f.documento), esc(f.entidad),
      formatDateDisplay(f.emision), formatDateDisplay(f.vencimiento),
      f.antiguedad, f.atraso,
      f.montoOriginal.toFixed(2), f.saldo.toFixed(2),
      esc(ESTADOS[f.estado].texto),
    ].join(','));

    // BOM al principio: sin el, Excel en Windows abre las tildes rotas.
    const blob = new Blob(['﻿' + [cabecera.join(','), ...cuerpo].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', P.fichero);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface-bright dark:bg-surface-dark-bright rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden flex flex-col">
      {/* Barra de herramientas */}
      <div className="p-4 border-b border-outline-variant/20 flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-container-lowest">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            placeholder={P.buscar}
            className="pl-9 bg-white dark:bg-neutral-900 border-outline-variant/30"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* El contador dice cuantas hay escondidas: sin el, un total que no
              cuadra con lo que se ve parece un error de la pantalla. */}
          <Button
            variant="outline" size="sm" className="flex items-center gap-2"
            onClick={() => setVerSaldadas(v => !v)}
            aria-pressed={verSaldadas}
            title={verSaldadas ? 'Ocultar las cuentas ya saldadas' : 'Mostrar también las cuentas ya saldadas'}
          >
            {verSaldadas ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden md:inline">
              {verSaldadas ? 'Ocultar saldadas' : `Ver saldadas${saldadas ? ` (${saldadas})` : ''}`}
            </span>
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-surface-container-low text-neutral-500">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className="px-6 py-4 font-semibold">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-surface-container-lowest transition-colors">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-neutral-500">
                  {busca
                    ? 'No se encontraron registros que coincidan con la búsqueda.'
                    : saldadas > 0
                      ? `No hay cuentas pendientes. Hay ${saldadas} ya saldada${saldadas === 1 ? '' : 's'}: púlsalas arriba para verlas.`
                      : 'No hay cuentas registradas todavía.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pie: paginacion de verdad */}
      <div className="p-4 border-t border-outline-variant/20 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-neutral-500 bg-surface-container-lowest">
        <div className="flex items-center gap-4">
          <span>
            {filas.length === 0 ? 'Sin registros' : (
              <>Página {table.getState().pagination.pageIndex + 1} de {Math.max(1, table.getPageCount())} · {filas.length} registro{filas.length === 1 ? '' : 's'}</>
            )}
          </span>
          <span className="font-semibold text-neutral-700 dark:text-neutral-300 font-mono-data">
            Total: {fmt(totalSaldo)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
