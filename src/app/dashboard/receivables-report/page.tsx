'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Landmark, Printer, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Input } from '@/components/ui/input';
import { CustomerAutocomplete } from '@/components/ui/customer-autocomplete';
import { AutocompleteSelect } from '@/components/ui/autocomplete-select';

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
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [printing, setPrinting] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [printingCustomer, setPrintingCustomer] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [selectedCustomer]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports/receivables?customerId=${selectedCustomer || 'all'}`);
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
      window.open(`/api/v1/reports/receivables/print?customerId=${selectedCustomer || 'all'}`, '_blank');
    } catch (e) {
      toast.error('Error al generar reporte');
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintCustomer = async (customerId: string) => {
    setPrintingCustomer(customerId);
    try {
      window.open(`/api/v1/reports/receivables/print?customerId=${customerId}`, '_blank');
    } catch (e) {
      toast.error('Error al generar reporte del cliente');
    } finally {
      setPrintingCustomer(null);
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
            <div className="relative">
              <CustomerAutocomplete
                dbCustomers={groupedCustomers.map(g => ({ id: g.customerId, name: g.customerName, rncCedula: g.customerRnc }))}
                customerId={selectedCustomer}
                customerName={customerName}
                onSelect={(customer) => {
                  setSelectedCustomer(customer.id);
                  setCustomerName(customer.name);
                }}
                onTextChange={(val) => {
                  setCustomerName(val);
                }}
                onClear={() => {
                  setSelectedCustomer('');
                  setCustomerName('');
                }}
                placeholder="Todos los clientes"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="bg-[#003366] hover:bg-[#002244] disabled:opacity-50 text-white font-bold py-2 px-4 h-10 rounded-lg shadow-md hover:shadow-lg transition flex items-center gap-2 text-sm"
            >
              <Printer className="h-4.5 w-4.5" /> 
              {printing ? 'Generando...' : 'Imprimir Reporte'}
            </button>
          </div>
        </div>

        {/* Main Customers Table */}
        <div className="bg-white rounded-2xl border border-slate-200/30 shadow-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003366]"></div>
            </div>
          ) : groupedCustomers.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No se encontraron cuentas por cobrar pendientes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#003366] text-white">
                  <tr>
                    <th className="px-6 py-4 font-bold rounded-tl-xl">Cliente</th>
                    <th className="px-6 py-4 font-bold">RNC/Cédula</th>
                    <th className="px-6 py-4 text-right font-bold">Facturas Pendientes</th>
                    <th className="px-6 py-4 text-right font-bold">Balance Pendiente</th>
                    <th className="px-6 py-4 text-center font-bold rounded-tr-xl">Acciones</th>
                  </tr>
                </thead>
                <AnimatePresence mode="popLayout">
                  {groupedCustomers.map(group => {
                    const isExpanded = expandedCustomer === group.customerId;
                    return (
                      <motion.tbody 
                        key={group.customerId}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.3 }}
                      >
                        {/* Customer Row */}
                        <tr className={clsx("hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100", isExpanded && "bg-slate-50/80 border-transparent")} onClick={() => setExpandedCustomer(isExpanded ? null : group.customerId)}>
                          <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {group.customerName.substring(0, 2).toUpperCase()}
                            </div>
                            {group.customerName}
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-600">{group.customerRnc || 'N/A'}</td>
                          <td className="px-6 py-4 text-right font-medium text-slate-600">{group.invoices.length}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-rose-600">{fmt(group.totalBalance)}</td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedCustomer(isExpanded ? null : group.customerId); }}
                              className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-full hover:bg-slate-200"
                            >
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Area (Invoices Table & Card) */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="bg-slate-50 border-b-2 border-[#003366]/20"
                            >
                              <td colSpan={5} className="p-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-6">
                                    <div className="bg-white rounded-xl border border-slate-200/50 shadow-sm p-4">
                                      <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                                        <h3 className="font-bold text-[#003366] flex items-center gap-2">
                                          <Receipt className="w-5 h-5 text-amber-500" /> Detalle de Cuentas por Cobrar
                                        </h3>
                                        <button
                                          onClick={() => handlePrintCustomer(group.customerId)}
                                          disabled={printingCustomer === group.customerId}
                                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-50 font-bold py-1.5 px-4 rounded-lg shadow-sm transition flex items-center gap-2 text-xs"
                                        >
                                          <Printer className="h-4 w-4" /> 
                                          {printingCustomer === group.customerId ? 'Generando...' : 'Imprimir'}
                                        </button>
                                      </div>

                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                          <thead className="bg-slate-50/80 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200">
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
                                                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                                                  <td className="px-4 py-2.5 font-mono font-bold text-[#003366]">
                                                    {invoice.codigoFactura || 'S/N'}
                                                  </td>
                                                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{invoice.ncf || '-'}</td>
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
                                  </div>
                                </motion.div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </motion.tbody>
                    );
                  })}
                </AnimatePresence>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
