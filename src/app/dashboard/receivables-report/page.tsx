'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Landmark, Printer, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Select } from '@/components/ui/select';

interface ReceivablesData {
  id: string;
  invoiceId: string;
  ncf: string;
  codigoFactura: string;
  amount: string;
  balance: string;
  dueDate: string;
  status: string;
  customerId: string;
  customerName: string;
  customerRnc: string;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  customerRnc: string;
  totalBalance: number;
  invoices: ReceivablesData[];
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function ReceivablesReportPage() {
  const router = useRouter();
  const [data, setData] = useState<ReceivablesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
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
      const res = await fetch('/api/v1/contacts?type=customer&limit=1000');
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
      const res = await fetch(`/api/v1/reports/receivables?customerId=${selectedCustomer}`);
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

  const handlePrint = async () => {
    setPrinting(true);
    try {
      window.open(`/api/v1/reports/receivables/print?customerId=${selectedCustomer}`, '_blank');
    } catch (e) {
      toast.error('Error al generar reporte');
    } finally {
      setPrinting(false);
    }
  };

  // Group by customer
  const groupedData: Record<string, CustomerGroup> = {};
  let totalBalance = 0;
  let overdueBalance = 0;

  data.forEach(item => {
    if (!groupedData[item.customerId]) {
      groupedData[item.customerId] = {
        customerId: item.customerId,
        customerName: item.customerName,
        customerRnc: item.customerRnc,
        totalBalance: 0,
        invoices: []
      };
    }
    groupedData[item.customerId].invoices.push(item);
    groupedData[item.customerId].totalBalance += Number(item.balance);
    
    totalBalance += Number(item.balance);
    if (new Date(item.dueDate) < new Date()) {
      overdueBalance += Number(item.balance);
    }
  });

  const groupedCustomers = Object.values(groupedData);

  return (
    <div className="min-h-full bg-slate-50 text-on-surface font-sans pb-20 max-w-7xl mx-auto w-full">
      {/* Environment Indicator */}
      <div className="bg-[#002b49] w-full px-8 py-1.5 flex justify-end items-center border-b border-slate-200/30">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-amber-500" /> Cuentas por Cobrar
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-[#003366] tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8 text-amber-500" />
              Módulo de Cuentas por Cobrar
            </h1>
            <p className="text-slate-500 text-sm mt-1.5">
              Gestione balances pendientes de clientes y consolide facturas pendientes de cobro.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200/30 shadow-lg flex flex-col items-end min-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500/70">Cuentas por Cobrar Total</span>
              <span className="text-2xl font-mono font-bold text-amber-500 mt-1">{fmt(totalBalance)}</span>
            </div>
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200/30 shadow-lg flex flex-col items-end min-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500/70">Balance Vencido</span>
              <span className="text-2xl font-mono font-bold text-rose-500 mt-1">{fmt(overdueBalance)}</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/30 shadow-lg flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="w-full sm:w-1/3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Filtrar por Cliente</label>
            <Select 
              value={selectedCustomer} 
              onChange={(e) => setSelectedCustomer(e.target.value)} 
              className="w-full bg-slate-50 border-slate-200 text-slate-800"
            >
              <option value="all">Todos los clientes</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="bg-[#003366] hover:bg-[#002244] disabled:opacity-50 text-white font-bold py-2 px-4 h-10 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm"
            >
              <Printer className="h-4.5 w-4.5" /> 
              {printing ? 'Generando...' : 'Imprimir Reporte'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003366]"></div>
            </div>
          ) : groupedCustomers.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200/30 shadow-sm text-center">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No se encontraron cuentas por cobrar pendientes.</p>
            </div>
          ) : (
            groupedCustomers.map(group => (
              <div key={group.customerId} className="bg-white rounded-2xl border border-slate-200/30 shadow-sm overflow-hidden transition-all hover:shadow-md group">
                
                {/* Customer Header */}
                <div className="bg-slate-50/50 p-4 border-b border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                        {group.customerName.substring(0, 2).toUpperCase()}
                      </div>
                      {group.customerName}
                    </h2>
                    <p className="text-xs font-mono text-slate-500 mt-1 ml-10">RNC/Cédula: {group.customerRnc || 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500/70 uppercase tracking-widest">Balance Pendiente</p>
                      <p className="font-mono text-lg font-bold text-indigo-600">{fmt(group.totalBalance)}</p>
                    </div>
                  </div>
                </div>

                {/* Invoices List */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/40 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Factura / Código</th>
                        <th className="px-4 py-2.5">NCF</th>
                        <th className="px-4 py-2.5">Vencimiento</th>
                        <th className="px-4 py-2.5 text-right">Monto Original</th>
                        <th className="px-4 py-2.5 text-right">Balance Pendiente</th>
                        <th className="px-4 py-2.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.invoices.map(invoice => {
                        const isOverdue = new Date(invoice.dueDate) < new Date();
                        return (
                          <tr key={invoice.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-[#003366]">
                              {invoice.codigoFactura || 'S/N'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{invoice.ncf || '-'}</td>
                            <td className="px-4 py-2.5">
                              <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold", isOverdue ? 'bg-rose-500/10 text-rose-600 border border-rose-500/10' : 'text-slate-600')}>
                                {isOverdue && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                                {new Date(invoice.dueDate).toLocaleDateString('es-DO')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-500 font-mono">{fmt(Number(invoice.amount))}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{fmt(Number(invoice.balance))}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={clsx("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
                                {isOverdue ? 'Vencida' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
