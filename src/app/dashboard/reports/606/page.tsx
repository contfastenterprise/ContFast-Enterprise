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

export default function Report606() {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState({ amount: 0, itbis: 0, itbisRetained: 0 });

  const fetchExpenses = async () => {
    const companyId = 'TODO_COMPANY_ID'; // TODO: replace with actual context
    try {
      const res = await fetch(`/api/v1/reports/606?companyId=${companyId}&period=${period}`);
      const data = await res.json();
      setExpenses(data.expenses || []);
      setTotals(data.totals || { amount: 0, itbis: 0, itbisRetained: 0 });
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [period]);

  const exportTxt = async () => {
    const companyId = 'TODO_COMPANY_ID';
    try {
      const res = await fetch(`/api/v1/reports/606/txt?companyId=${companyId}&period=${period}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `606_${companyId}_${period}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting TXT:', error);
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
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Reporte ITBIS 606 - Fiscal</h1>
      <div className="flex space-x-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periodo</label>
          <input
            type="month"
            value={period}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPeriod(e.target.value)}
            className="w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={exportTxt}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors h-[38px] flex items-center justify-center"
        >
          Exportar TXT
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.amount || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">ITBIS Facturado</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.itbis || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">ITBIS Retenido</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.itbisRetained || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded shadow">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs uppercase font-semibold">
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">NCF</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Fecha</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Tipo Gasto</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Monto</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">ITBIS</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">ITBIS Retenido</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-600 dark:text-gray-400">
            {!expenses || expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  No hay gastos registrados para este periodo.
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{e.ncf}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{e.issueDate}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    {expenseTypes.find((t) => t.value === e.expenseType)?.label ?? e.expenseType ?? '—'}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{(e.amount || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{(e.itbis || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{(e.itbisRetained || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
