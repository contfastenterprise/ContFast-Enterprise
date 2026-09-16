// src/app/dashboard/reports/606/page.tsx
'use client';

import { useState, useEffect } from 'react';

interface Expense {
  id: string;
  ncf: string;
  issueDate: string;
  paymentMethod: string;
  amount: number;
  itbis: number;
  itbisRetained: number;
  expenseType?: string;
}

import { FileText, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { vaEnElDetalle606 } from '@/services/dgii/formato606';

export default function Report606() {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState({ amount: 0, itbis: 0, itbisRetained: 0 });
  // P2-37: "no pude leerlo" y "no hay nada" no son la misma pantalla. Aqui era
  // literalmente el mismo mensaje: la ruta contestaba 403 y se leia "No hay
  // gastos registrados para este periodo".
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const fetchExpenses = async () => {
    setErrorCarga(null);
    try {
      // Iba `companyId=TODO_COMPANY_ID`, el literal, con un "// TODO: replace
      // with actual context" al lado. La ruta contestaba 403 y esta pantalla
      // enseñaba "No hay gastos registrados para este periodo" -- todos los
      // meses, con 48 gastos en julio y 33 en agosto en la base. Ya no hace
      // falta decirlo: la sesion dice de que empresa es.
      const res = await fetch(`/api/v1/reports/606?period=${period}`);
      const data = await res.json();
      if (!res.ok) {
        setExpenses([]);
        setTotals({ amount: 0, itbis: 0, itbisRetained: 0 });
        setErrorCarga(motivoDeCarga(null, data?.error));
        return;
      }
      setExpenses(data.expenses || []);
      setTotals(data.totals || { amount: 0, itbis: 0, itbisRetained: 0 });
    } catch (error) {
      setExpenses([]);
      setTotals({ amount: 0, itbis: 0, itbisRetained: 0 });
      setErrorCarga(motivoDeCarga(error));
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [period]);

  const exportTxt = async () => {
    try {
      // Apuntaba a `/api/v1/reports/606/txt`, que NO EXISTE: el 606 tiene
      // `download/` y el que tiene `txt/` es el 607. Y como `res.blob()` no
      // mira el estado, el 404 se descargaba como si fuera el fichero: un
      // `606_TODO_COMPANY_ID_2026-09.txt` con la pagina de error dentro, que
      // es lo que se le habria mandado a la DGII.
      const res = await fetch(`/api/v1/reports/606/download?period=${period}`);
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        toast.error(motivoDeCarga(null, detalle?.error) || 'No se pudo generar el TXT del 606');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // El nombre lo pone el servidor (lote 144): DGII_F_606_<RNC>_<AAAAMM>.TXT.
      const disposicion = res.headers.get('Content-Disposition') || '';
      a.download = /filename="([^"]+)"/.exec(disposicion)?.[1] || `606_${period}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(motivoDeCarga(error));
    }
  };

  const expenseTypes = [
    { value: '01', label: 'Gastos de Personal' },
    { value: '02', label: 'Gastos por Trabajos, Suministros y Servicios' },
    { value: '03', label: 'Arrendamientos' },
    { value: '04', label: 'Gastos de Activos Fijos' },
    { value: '05', label: 'Gastos de Representación' },
    { value: '06', label: 'Otras Deducciones Admitidas' },
    { value: '07', label: 'Gastos Financieros' },
    { value: '08', label: 'Gastos Extraordinarios' },
    { value: '09', label: 'Compras y Gastos que Formarán Parte del Costo de Venta' },
    { value: '10', label: 'Adquisiciones de Activos' },
    { value: '11', label: 'Gastos de Seguros' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      
      {/* Header section with title and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-display flex items-center gap-2">
            <FileText className="h-8 w-8 text-[#c5a059]" />
            Reporte ITBIS 606 - Fiscal
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Compras y gastos para la DGII.</p>
        </div>
      </div>

      {/* Global Filter */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-end gap-4">
        <div>
          <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Periodo</label>
          <input
            type="month"
            value={period}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPeriod(e.target.value)}
            className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
          />
        </div>
        <button
          onClick={exportTxt}
          className="flex items-center justify-center gap-2 bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2 rounded-lg font-bold text-sm transition shadow-md"
        >
          <Download className="h-4 w-4" /> Exportar TXT
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">Monto Total</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.amount || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">ITBIS Facturado</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.itbis || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">ITBIS Retenido</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.itbisRetained || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Lote 144: las compras sin NCF no van al TXT (una linea del 606 sin NCF
          no es valida). Se dicen aqui para que no desaparezcan sin que nadie lo
          sepa: sustentarlas es cosa del contador. */}
      {expenses.filter((e) => !vaEnElDetalle606(e)).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
          {expenses.filter((e) => !vaEnElDetalle606(e)).length} compra(s) de este período no tienen NCF y <strong>no van en el TXT</strong>.
          Aparecen marcadas en la tabla.
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[#003366] text-xs uppercase font-bold border-b border-slate-200">
                <th className="px-6 py-4">NCF</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo Gasto</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-right">ITBIS</th>
                <th className="px-6 py-4 text-right">ITBIS Retenido</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
              {errorCarga ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4">
                    <ErrorDeCarga mensaje={errorCarga} onReintentar={fetchExpenses} />
                  </td>
                </tr>
              ) : !expenses || expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay gastos registrados para este periodo.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono">
                      {e.ncf}
                      {!vaEnElDetalle606(e) && <span className="block text-[10px] font-sans text-amber-700">Sin NCF: no va en el TXT</span>}
                    </td>
                    <td className="px-6 py-4">{e.issueDate}</td>
                    <td className="px-6 py-4">
                      {expenseTypes.find((t) => t.value === e.expenseType)?.label ?? e.expenseType ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">{(e.amount || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">{(e.itbis || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">{(e.itbisRetained || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
