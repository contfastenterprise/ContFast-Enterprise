'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Search, Receipt, Plus, RefreshCw, X, HandCoins, Building2, Calendar, CreditCard, Landmark, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

// -- Types --
interface InvoiceAR {
  arId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  balance: number;
  dueDate: string;
  status: string;
}

interface CustomerAR {
  customerId: string;
  customerName: string;
  totalBalance: number;
  invoices: InvoiceAR[];
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function ReceivablesPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerAR[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Selected Payment State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAR | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank',
    amount: '',
    reference: '',
    notes: ''
  });
  const [appliedInvoices, setAppliedInvoices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ar');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
      } else {
        toast.error('Error al cargar cuentas por cobrar');
      }
    } catch (err) {
      toast.error('Error de red al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayment = (customer: CustomerAR) => {
    setSelectedCustomer(customer);
    setPaymentForm({
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'bank',
      amount: '',
      reference: '',
      notes: ''
    });
    setAppliedInvoices({});
    setShowPaymentModal(true);
  };

  // Automatically distribute payment amount across oldest invoices first
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amountInput = e.target.value;
    setPaymentForm({ ...paymentForm, amount: amountInput });
    
    if (!selectedCustomer) return;

    let remainingAmount = parseFloat(amountInput) || 0;
    const newApplied: Record<string, number> = {};

    // Sort invoices by due date (oldest first)
    const sortedInvoices = [...selectedCustomer.invoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    for (const inv of sortedInvoices) {
      if (remainingAmount <= 0) break;
      
      const applied = Math.min(remainingAmount, inv.balance);
      newApplied[inv.arId] = applied;
      remainingAmount -= applied;
    }

    setAppliedInvoices(newApplied);
  };

  const handleManualApplyChange = (arId: string, val: string, maxBalance: number) => {
    let numVal = parseFloat(val) || 0;
    if (numVal > maxBalance) numVal = maxBalance;
    if (numVal < 0) numVal = 0;

    const newApplied = { ...appliedInvoices, [arId]: numVal };
    if (numVal === 0) delete newApplied[arId];

    setAppliedInvoices(newApplied);
    
    // Update total amount based on manual sum
    const newTotal = Object.values(newApplied).reduce((sum, v) => sum + v, 0);
    setPaymentForm({ ...paymentForm, amount: newTotal.toString() });
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }

    const totalApplied = Object.values(appliedInvoices).reduce((sum, v) => sum + v, 0);
    if (Math.abs(totalApplied - amount) > 0.01) {
      toast.error('El monto a cobrar no coincide con la suma aplicada a las facturas');
      return;
    }

    const invoicesToApply = Object.entries(appliedInvoices)
      .filter(([_, amt]) => amt > 0)
      .map(([arId, amountApplied]) => ({ arId, amountApplied }));

    if (invoicesToApply.length === 0) {
      toast.error('Debe aplicar el cobro a por lo menos una factura');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/ar/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.customerId,
          date: paymentForm.date,
          paymentMethod: paymentForm.paymentMethod,
          amount,
          reference: paymentForm.reference,
          notes: paymentForm.notes,
          invoicesApplied: invoicesToApply
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Cobro registrado exitosamente', {
          description: paymentForm.paymentMethod === 'cash' ? 'Ingresado a Caja Chica y Asiento contable generado.' : 'Asiento contable generado.'
        });
        setShowPaymentModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al registrar cobro');
      }
    } catch (error) {
      toast.error('Error de red al procesar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(c => c.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
  const globalTotalPending = customers.reduce((sum, c) => sum + c.totalBalance, 0);

  return (
    <DashboardLayout>
      <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20">
        <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
           <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
             <HandCoins className="h-3 w-3" /> Cuentas por Cobrar (Cobros)
           </span>
        </div>

        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
                Cuentas por Cobrar
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Gestión de balances pendientes de clientes y registro de cobros.
              </p>
            </div>
            <div className="bg-white px-6 py-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Total Pendiente Global</span>
              <span className="text-2xl font-mono font-bold text-[#C5A059] leading-none mt-1">{fmt(globalTotalPending)}</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar cliente..."
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Customer List */}
          <AnimatePresence mode="wait">
            {loading ? (
              <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
            ) : filteredCustomers.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-sm">
                <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#003366]">Todo al día</h3>
                <p className="text-slate-500 mt-2">No hay facturas pendientes de cobro en este momento.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCustomers.map(customer => (
                  <div key={customer.customerId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Customer Header */}
                    <div className="bg-slate-50 border-b border-slate-200 p-5 flex flex-wrap justify-between items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-[#003366]/10 text-[#003366] rounded-lg flex items-center justify-center">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">{customer.customerName}</h3>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{customer.invoices.length} {customer.invoices.length === 1 ? 'Factura Pendiente' : 'Facturas Pendientes'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance Total</p>
                          <p className="font-mono text-lg font-bold text-rose-600">{fmt(customer.totalBalance)}</p>
                        </div>
                        <button
                          onClick={() => handleOpenPayment(customer)}
                          className="bg-[#003366] hover:bg-[#002244] text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2"
                        >
                          <Receipt className="h-4 w-4" /> Registrar Cobro
                        </button>
                      </div>
                    </div>
                    
                    {/* Invoices List */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-white border-b border-slate-100 text-xs text-slate-400 uppercase font-semibold">
                          <tr>
                            <th className="px-6 py-3">NCF / Documento</th>
                            <th className="px-6 py-3">Fecha Emisión</th>
                            <th className="px-6 py-3">Vencimiento</th>
                            <th className="px-6 py-3 text-right">Monto Original</th>
                            <th className="px-6 py-3 text-right">Balance Restante</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {customer.invoices.map(inv => {
                            const isOverdue = new Date(inv.dueDate) < new Date() && inv.balance > 0;
                            return (
                              <tr key={inv.arId} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-3 font-mono font-bold text-[#003366]">{inv.invoiceNumber}</td>
                                <td className="px-6 py-3 text-slate-600">{new Date(inv.invoiceDate).toLocaleDateString('es-DO')}</td>
                                <td className="px-6 py-3">
                                  <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium", isOverdue ? 'bg-rose-100 text-rose-700' : 'text-slate-600')}>
                                    {isOverdue && <AlertCircle className="w-3 h-3" />}
                                    {new Date(inv.dueDate).toLocaleDateString('es-DO')}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right text-slate-500 font-mono">{fmt(inv.amount)}</td>
                                <td className="px-6 py-3 text-right font-mono font-bold text-slate-800">{fmt(inv.balance)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnimatePresence>

        </div>

        {/* MODAL: REGISTRAR COBRO */}
        <AnimatePresence>
          {showPaymentModal && selectedCustomer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPaymentModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="bg-[#003366] px-6 py-5 flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2"><HandCoins className="w-5 h-5 text-[#C5A059]" /> Registrar Recibo de Cobro</h3>
                    <p className="text-blue-200 text-sm mt-0.5">{selectedCustomer.customerName}</p>
                  </div>
                  <button onClick={() => setShowPaymentModal(false)} className="text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
                </div>

                <div className="flex flex-col md:flex-row overflow-hidden flex-1">
                  {/* Left Column: Form Settings */}
                  <div className="md:w-1/3 bg-slate-50 border-r border-slate-200 p-6 space-y-5 overflow-y-auto shrink-0">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5"><Calendar className="w-3 h-3 inline mr-1"/> Fecha de Cobro</label>
                      <input type="date" required value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5"><CreditCard className="w-3 h-3 inline mr-1"/> Método de Pago</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setPaymentForm({...paymentForm, paymentMethod: 'bank'})} className={clsx("py-2 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-all", paymentForm.paymentMethod === 'bank' ? 'bg-[#003366] border-[#003366] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
                           <Landmark className="w-4 h-4" /> Banco
                        </button>
                        <button type="button" onClick={() => setPaymentForm({...paymentForm, paymentMethod: 'cash'})} className={clsx("py-2 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-all", paymentForm.paymentMethod === 'cash' ? 'bg-[#003366] border-[#003366] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
                           <HandCoins className="w-4 h-4" /> Caja Chica
                        </button>
                      </div>
                      {paymentForm.paymentMethod === 'cash' && (
                        <p className="text-[10px] text-amber-600 mt-2 font-medium flex items-center gap-1 bg-amber-50 p-2 rounded border border-amber-200">
                          <AlertCircle className="w-3 h-3" /> Este cobro se agregará directamente al arqueo de tu sesión de caja actual.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Monto Recibido</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold">$</span>
                        <input type="number" min="0.01" step="0.01" required value={paymentForm.amount} onChange={handleAmountChange} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2.5 outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] font-mono text-lg font-bold text-slate-800 shadow-sm" placeholder="0.00" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">El monto se auto-distribuye en las facturas más antiguas.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Referencia (Cheque/Transfer)</label>
                      <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm shadow-sm font-mono" placeholder="Ej. TX-98442" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nota Interna (Opcional)</label>
                      <textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm shadow-sm resize-none"></textarea>
                    </div>
                  </div>

                  {/* Right Column: Invoice Application */}
                  <div className="md:w-2/3 bg-white flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                      <h4 className="font-bold text-slate-700">Aplicación del Pago</h4>
                      <p className="text-xs text-slate-500">Distribuye el monto recibido en las facturas pendientes a continuación.</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b border-slate-100">
                          <tr>
                            <th className="pb-2">Factura</th>
                            <th className="pb-2 text-right">Vencimiento</th>
                            <th className="pb-2 text-right">Balance Original</th>
                            <th className="pb-2 text-right w-36">Monto a Aplicar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selectedCustomer.invoices.map(inv => {
                            const applied = appliedInvoices[inv.arId] || 0;
                            return (
                              <tr key={inv.arId} className={clsx("transition-colors", applied > 0 ? 'bg-emerald-50/50' : '')}>
                                <td className="py-3">
                                  <span className="font-mono font-bold text-[#003366] block">{inv.invoiceNumber}</span>
                                </td>
                                <td className="py-3 text-right text-slate-500">{new Date(inv.dueDate).toLocaleDateString('es-DO')}</td>
                                <td className="py-3 text-right font-mono font-bold text-slate-700">{fmt(inv.balance)}</td>
                                <td className="py-3 text-right">
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max={inv.balance} 
                                    step="0.01" 
                                    value={applied || ''} 
                                    onChange={(e) => handleManualApplyChange(inv.arId, e.target.value, inv.balance)}
                                    className={clsx("w-full border rounded px-2 py-1.5 text-right font-mono text-sm outline-none focus:ring-1 transition-all", applied > 0 ? 'border-emerald-300 bg-emerald-50 focus:ring-emerald-500 text-emerald-800 font-bold' : 'border-slate-200 focus:border-[#003366]')} 
                                    placeholder="0.00" 
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Summary Footer */}
                    <div className="bg-slate-50 border-t border-slate-200 p-6 shrink-0 flex items-center justify-between">
                      <div className="flex gap-8">
                         <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto Recibido</p>
                           <p className="font-mono text-xl font-bold text-slate-800">{fmt(parseFloat(paymentForm.amount) || 0)}</p>
                         </div>
                         <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Aplicado</p>
                           <p className={clsx("font-mono text-xl font-bold", Math.abs((parseFloat(paymentForm.amount) || 0) - Object.values(appliedInvoices).reduce((s,v)=>s+v,0)) < 0.01 ? 'text-emerald-600' : 'text-rose-600')}>
                             {fmt(Object.values(appliedInvoices).reduce((s,v)=>s+v,0))}
                           </p>
                         </div>
                      </div>
                      
                      <button type="button" onClick={handleSubmitPayment} disabled={submitting} className="bg-[#C5A059] hover:bg-[#b08c4a] text-white font-bold py-3 px-8 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Receipt className="w-5 h-5" />}
                        Procesar Recibo
                      </button>
                    </div>

                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
}
