'use client';

import { useState, useEffect } from 'react';

interface InvoiceSale {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  subtotal: number;
  discount: number;
  totalTaxes: number;
  total: number;
  createdAt: string;
  customerName?: string;
  customerRnc?: string;
}

export default function Report607() {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });
  const [invoices, setInvoices] = useState<InvoiceSale[]>([]);
  const [totals, setTotals] = useState({ subtotal: 0, itbis: 0, total: 0 });

  const fetchSales = async () => {
    try {
      const [year, month] = period.split('-');
      const start = `${year}-${month}-01`;
      const end = new Date(Number(year), Number(month), 0).toISOString().split('T')[0]; // last day of month

      const res = await fetch(`/api/v1/reports/sales-book?start_date=${start}&end_date=${end}`);
      const data = await res.json();
      if (data.success && data.data) {
        setInvoices(data.data.invoices || []);
        setTotals({
          subtotal: data.data.summary.subtotal || 0,
          itbis: data.data.summary.itbis || 0,
          total: data.data.summary.total || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [period]);

  const exportTxt = async () => {
    // We need the companyId to export the 607 txt. We can try fetching company profile or relying on the backend to figure it out from the auth session.
    // The txt route expects companyId. Let's fetch it from auth/me.
    try {
      const authRes = await fetch('/api/v1/auth/me');
      const authData = await authRes.json();
      const companyId = authData.data?.user?.companyId;

      if (!companyId) throw new Error('No companyId found');

      const res = await fetch(`/api/v1/reports/607/txt?companyId=${companyId}&period=${period}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `607_${companyId}_${period}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting TXT:', error);
    }
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Reporte ITBIS 607 - Ventas</h1>
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
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors h-[38px] flex items-center justify-center"
        >
          Exportar TXT 607
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">Subtotal (Gravado + Exento)</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.subtotal || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">ITBIS Facturado</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.itbis || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{(totals?.total || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded shadow">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs uppercase font-semibold">
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Fecha</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">NCF</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Cliente (RNC)</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Subtotal</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">ITBIS</th>
              <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="text-sm text-gray-600 dark:text-gray-400">
            {!invoices || invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  No hay ventas registradas para este periodo.
                </td>
              </tr>
            ) : (
              invoices.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{e.ncf}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    {e.customerName || 'Consumidor Final'} {e.customerRnc ? `(${e.customerRnc})` : ''}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{Number(e.subtotal || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{Number(e.totalTaxes || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">{Number(e.total || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
