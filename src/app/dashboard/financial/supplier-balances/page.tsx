'use client';

import React, { useState, useEffect } from 'react';
import { Truck, Search, Filter, AlertCircle, Receipt, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { AutocompleteSelect } from '@/components/ui/autocomplete-select';

interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  supplierRnc: string;
  totalBalance: number;
  overdueBalance: number;
  overdue1to30: number;
  overdue31to60: number;
  overdue61Plus: number;
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function SupplierBalancesPage() {
  const [data, setData] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; rnc: string }[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedSupplier]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/v1/suppliers?limit=1000');
      if (res.ok) {
        const json = await res.json();
        setSuppliers(json.data || json);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports/balances/suppliers?supplierId=${selectedSupplier}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Error al cargar datos');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    setPrinting(true);
    try {
      window.open(`/api/v1/reports/balances/suppliers/print?supplierId=${selectedSupplier}`, '_blank');
    } catch (e) {
      toast.error('Error al generar reporte');
    } finally {
      setPrinting(false);
    }
  };

  const totalGlobal = data.reduce((acc, curr) => acc + curr.totalBalance, 0);
  const totalOverdue = data.reduce((acc, curr) => acc + curr.overdueBalance, 0);

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-outline-variant/10 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="text-primary-container w-7 h-7" /> Balance Acumulado de Suplidores (CxP)
          </h1>
          <p className="text-sm text-neutral-500">
            Resumen global y consolidado de los balances pendientes por suplidor.
          </p>
        </div>
        <button
          onClick={handlePrint}
          disabled={printing || loading || data.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-outline-variant/30 text-primary-600 rounded-xl shadow-sm hover:bg-surface-container-low transition-all font-medium whitespace-nowrap disabled:opacity-50"
        >
          {printing ? (
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          ) : (
            <Printer className="w-4 h-4" />
          )}
          Imprimir Reporte
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Balance Total General</p>
            <h2 className="text-3xl font-black text-primary mt-2">
              {loading ? '...' : fmt(totalGlobal)}
            </h2>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Balance Total Vencido</p>
            <h2 className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">
              {loading ? '...' : fmt(totalOverdue)}
            </h2>
          </div>
        </div>
      </div>

      <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block">Filtro por Suplidor</label>
        <div className="max-w-md">
          <AutocompleteSelect
            items={[
              { id: 'all', name: 'Todos los suplidores', subLabel: 'Ver todos' },
              ...suppliers.map((s) => ({
                id: s.id,
                name: s.name,
                subLabel: s.rnc ? `RNC: ${s.rnc}` : "Sin RNC",
              }))
            ]}
            value={selectedSupplier}
            onChange={(id) => {
              setSelectedSupplier(id || 'all');
            }}
            placeholder="Buscar suplidor..."
          />
        </div>
      </div>

      <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-surface-container-low/50 text-neutral-500 border-b border-outline-variant/20">
              <tr>
                <th className="px-6 py-4 font-semibold tracking-wider">Suplidor</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">Balance Acumulado</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">Vencido Total</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">[1-30]</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">[31-60]</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">[61+]</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-center">Estado de Cartera</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-neutral-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                      Cargando balances...
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-neutral-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No hay balances pendientes para este filtro.
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.supplierId} className="hover:bg-surface-container-low/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">{item.supplierName}</div>
                      <div className="text-xs text-neutral-500">{item.supplierRnc}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{fmt(item.totalBalance)}</td>
                    <td className="px-6 py-4 text-right">
                      {item.overdueBalance > 0 ? (
                        <span className="text-rose-600 font-semibold">{fmt(item.overdueBalance)}</span>
                      ) : (
                        <span className="text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">{item.overdue1to30 > 0 ? <span className="text-yellow-600 font-semibold">{fmt(item.overdue1to30)}</span> : '-'}</td>
                    <td className="px-6 py-4 text-right">{item.overdue31to60 > 0 ? <span className="text-orange-600 font-semibold">{fmt(item.overdue31to60)}</span> : '-'}</td>
                    <td className="px-6 py-4 text-right">{item.overdue61Plus > 0 ? <span className="text-red-600 font-semibold">{fmt(item.overdue61Plus)}</span> : '-'}</td>
                    <td className="px-6 py-4 text-center">
                      {item.overdueBalance > 0 ? (
                        <span className="px-2 py-1 bg-rose-500/10 text-rose-600 rounded-lg text-xs font-semibold">
                          Vencido
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg text-xs font-semibold">
                          Al Día
                        </span>
                      )}
                    </td>
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
