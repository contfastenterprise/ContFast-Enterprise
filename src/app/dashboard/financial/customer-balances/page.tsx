'use client';

import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, AlertCircle, HandCoins, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { AutocompleteSelect } from '@/components/ui/autocomplete-select';

interface CustomerBalance {
  customerId: string;
  customerName: string;
  customerRnc: string;
  totalBalance: number;
  overdueBalance: number;
  overdue1to30: number;
  overdue31to60: number;
  overdue61Plus: number;
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function CustomerBalancesPage() {
  const [data, setData] = useState<CustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<{ id: string; name: string; rncCedula: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/v1/customers?limit=1000');
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || json);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports/balances/customers?customerId=${selectedCustomer}`);
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
      window.open(`/api/v1/reports/balances/customers/print?customerId=${selectedCustomer}`, '_blank');
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
            <Users className="text-primary-container w-7 h-7" /> Balance Acumulado de Clientes (CxC)
          </h1>
          <p className="text-sm text-neutral-500">
            Resumen global y consolidado de los balances pendientes por cliente.
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
        <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Balance Total General</p>
            <h2 className="text-3xl font-black text-primary mt-2">
              {loading ? '...' : fmt(totalGlobal)}
            </h2>
          </div>
        </div>
        <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Balance Total Vencido</p>
            <h2 className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">
              {loading ? '...' : fmt(totalOverdue)}
            </h2>
          </div>
        </div>
      </div>

      <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block">Filtro por Cliente</label>
        <div className="max-w-md">
          <AutocompleteSelect
            items={[
              { id: 'all', name: 'Todos los clientes', subLabel: 'Ver todos' },
              ...customers.map((c) => ({
                id: c.id,
                name: c.name,
                subLabel: c.rncCedula ? `RNC: ${c.rncCedula}` : "Sin RNC",
              }))
            ]}
            value={selectedCustomer}
            onChange={(id) => {
              setSelectedCustomer(id || 'all');
            }}
            placeholder="Buscar cliente..."
          />
        </div>
      </div>

      <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-4">
        <div className="p-4 flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-lowest">
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Resumen de Antigüedad
            </h3>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center py-2 border-b border-outline-variant/20">
            <span className="text-neutral-500">Vencido [1-30 días]</span>
            <span className="font-semibold text-yellow-600">
              {fmt(data.reduce((acc, curr) => acc + (curr.overdue1to30 || 0), 0))}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-outline-variant/20">
            <span className="text-neutral-500">Vencido [31-60 días]</span>
            <span className="font-semibold text-orange-600">
              {fmt(data.reduce((acc, curr) => acc + (curr.overdue31to60 || 0), 0))}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-neutral-500">Vencido [61+ días]</span>
            <span className="font-semibold text-red-600">
              {fmt(data.reduce((acc, curr) => acc + (curr.overdue61Plus || 0), 0))}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-surface-container-low/50 text-neutral-500 border-b border-outline-variant/20">
              <tr>
                <th className="px-6 py-4 font-semibold tracking-wider">Cliente</th>
                <th className="py-4 px-4 text-right font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">Vencido Total</th>
                <th className="py-4 px-4 text-right font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">[1-30]</th>
                <th className="py-4 px-4 text-right font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">[31-60]</th>
                <th className="py-4 px-4 text-right font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">[61+]</th>
                <th className="py-4 px-4 text-right font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">Total Adeudado</th>
                <th className="py-4 px-4 text-center font-semibold text-neutral-900 dark:text-white border-b border-outline-variant/30">Estado de Cartera</th>
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
                  <tr key={item.customerId} className="hover:bg-surface-container-low/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">{item.customerName}</div>
                      <div className="text-xs text-neutral-500">{item.customerRnc}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-red-600 font-medium">{item.overdueBalance > 0 ? fmt(item.overdueBalance) : '-'}</td>
                    <td className="px-6 py-4 text-right text-yellow-600">{item.overdue1to30 > 0 ? fmt(item.overdue1to30) : '-'}</td>
                    <td className="px-6 py-4 text-right text-orange-600">{item.overdue31to60 > 0 ? fmt(item.overdue31to60) : '-'}</td>
                    <td className="px-6 py-4 text-right text-red-600 font-semibold">{item.overdue61Plus > 0 ? fmt(item.overdue61Plus) : '-'}</td>
                    <td className="px-6 py-4 text-right font-bold">{fmt(item.totalBalance)}</td>
                    <td className="px-6 py-4 text-center">
                      {item.overdueBalance > 0 ? (
                        <span className="px-2 py-1 bg-rose-500/10 text-rose-600 rounded-lg text-xs font-semibold">
                          Moroso
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
