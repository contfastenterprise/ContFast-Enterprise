'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Search, Receipt, Plus, RefreshCw, X, HandCoins, Building2, Calendar, CreditCard, Landmark, CheckCircle2, AlertCircle, Printer, Eye, History, FileText, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

// -- Types --
interface InvoiceAR {
  arId: string;
  invoiceId: string;
  invoiceNumber: string;
  codigoFactura?: string;
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
  return new Intl.NumberFormat('es-DO', { 
    style: 'currency', 
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val || 0);
};

export default function ReceivablesPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerAR[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printingCustomerId, setPrintingCustomerId] = useState<string | null>(null);

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

  // Receipts History Tab State
  const [activeTab, setActiveTab] = useState<'pending' | 'receipts' | 'customer_statement'>('pending');
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');
  const [receiptStartDate, setReceiptStartDate] = useState('');
  const [receiptEndDate, setReceiptEndDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [showReceiptDetailsModal, setShowReceiptDetailsModal] = useState(false);
  const [loadingReceiptDetails, setLoadingReceiptDetails] = useState(false);

  // Customer Statement Tab State
  const [statementCustomers, setStatementCustomers] = useState<any[]>([]);
  const [selectedStatementCustomerId, setSelectedStatementCustomerId] = useState('');
  const [statementReceipts, setStatementReceipts] = useState<any[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementSearch, setStatementSearch] = useState('');
  const [printingStatement, setPrintingStatement] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'customer_statement' && statementCustomers.length === 0) {
      fetchStatementCustomers();
    }
  }, [activeTab]);

  const fetchStatementCustomers = async () => {
    try {
      const res = await fetch('/api/v1/customers?limit=200');
      const data = await res.json();
      if (data.success) {
        setStatementCustomers(data.data);
      }
    } catch (err) {
      console.error('Error fetching customers for statement:', err);
    }
  };

  const fetchCustomerStatement = async (customerId: string) => {
    if (!customerId) return;
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/v1/ar/receipts/by-customer?customerId=${customerId}`);
      const data = await res.json();
      if (data.success) {
        setStatementReceipts(data.data);
      } else {
        toast.error('Error al cargar estado de cuenta');
      }
    } catch (err) {
      toast.error('Error de red al cargar estado de cuenta');
    } finally {
      setStatementLoading(false);
    }
  };

  const fetchReceipts = async () => {
    setReceiptsLoading(true);
    setHasSearched(true);
    try {
      const queryParams = new URLSearchParams();
      if (receiptSearchTerm) queryParams.append('search', receiptSearchTerm);
      if (receiptStartDate) queryParams.append('startDate', receiptStartDate);
      if (receiptEndDate) queryParams.append('endDate', receiptEndDate);

      const res = await fetch(`/api/v1/ar/receipts?${queryParams.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReceipts(data.data);
      } else {
        toast.error('Error al cargar historial de recibos');
      }
    } catch (err) {
      toast.error('Error de red al cargar recibos');
    } finally {
      setReceiptsLoading(false);
    }
  };

  const handleOpenReceiptDetails = async (receiptId: string) => {
    setLoadingReceiptDetails(true);
    setShowReceiptDetailsModal(true);
    try {
      const res = await fetch(`/api/v1/ar/receipts/${receiptId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedReceipt(data.data);
      } else {
        toast.error('Error al obtener detalles del recibo');
        setShowReceiptDetailsModal(false);
      }
    } catch (err) {
      toast.error('Error de red al obtener detalles');
      setShowReceiptDetailsModal(false);
    } finally {
      setLoadingReceiptDetails(false);
    }
  };

  const handlePrintReceipt = async (receiptId: string) => {
    const toastId = toast.loading('Generando PDF del recibo...');
    try {
      const res = await fetch(`/api/v1/ar/receipts/${receiptId}/print`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.url) {
        toast.success('PDF generado con éxito', { id: toastId });
        window.open(data.url, '_blank');
      } else {
        toast.error(data.error?.message || 'Error al generar PDF', { id: toastId });
      }
    } catch (err) {
      toast.error('Error de red al generar PDF', { id: toastId });
    }
  };

  const handlePrintStatement = async () => {
    if (!selectedStatementCustomerId) return;
    const toastId = toast.loading('Generando PDF del estado de cuenta...');
    setPrintingStatement(true);
    try {
      const res = await fetch('/api/v1/ar/receipts/by-customer/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          customerId: selectedStatementCustomerId,
          search: statementSearch
        })
      });
      const data = await res.json();
      if (data.success && data.url) {
        toast.success('PDF del estado de cuenta generado con éxito', { id: toastId });
        window.open(data.url, '_blank');
      } else {
        toast.error(data.error?.message || 'Error al generar PDF del estado', { id: toastId });
      }
    } catch (err) {
      toast.error('Error de red al generar PDF del estado', { id: toastId });
    } finally {
      setPrintingStatement(false);
    }
  };

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

  const handlePrintCustomerStatement = async (customerId: string) => {
    setPrintingCustomerId(customerId);
    const toastId = toast.loading('Generando estado de cuenta...');
    try {
      const url = `/api/v1/reports/pdf?type=ar_statement&customerId=${customerId}`;
      window.open(url, '_blank');
      toast.success('Documento enviado a imprimir', { id: toastId });
    } catch (err) {
      toast.error('Error al abrir documento de impresión', { id: toastId });
    } finally {
      setPrintingCustomerId(null);
    }
  };

  const handleOpenPayment = (customer: CustomerAR) => {
    setSelectedCustomer(customer);
    setPaymentForm({
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      amount: '',
      reference: '',
      notes: ''
    });
    setAppliedInvoices({});
    setShowPaymentModal(true);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amountInput = e.target.value;
    setPaymentForm({ ...paymentForm, amount: amountInput });
  };

  const handleDistributeAmount = () => {
    if (!selectedCustomer) return;

    let remainingAmount = Math.round((parseFloat(paymentForm.amount) || 0) * 100) / 100;
    const newApplied: Record<string, number> = {};

    // Sort invoices by due date (oldest first)
    const sortedInvoices = [...selectedCustomer.invoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    for (const inv of sortedInvoices) {
      if (remainingAmount <= 0) break;

      const applied = Math.round(Math.min(remainingAmount, inv.balance) * 100) / 100;
      newApplied[inv.arId] = applied;
      remainingAmount = Math.round((remainingAmount - applied) * 100) / 100;
    }

    setAppliedInvoices(newApplied);
  };

  const handleManualApplyChange = (arId: string, val: string, maxBalance: number) => {
    // Force a maximum of two decimal places by truncating extra decimals
    if (val.includes('.') && val.split('.')[1].length > 2) {
      val = val.split('.')[0] + '.' + val.split('.')[1].slice(0, 2);
    }

    let numVal = parseFloat(val) || 0;
    if (numVal > maxBalance) numVal = maxBalance;
    if (numVal < 0) numVal = 0;

    const newApplied = { ...appliedInvoices, [arId]: numVal };
    if (numVal === 0) delete newApplied[arId];

    setAppliedInvoices(newApplied);

    // Update total amount based on manual sum, rounded to 2 decimal places
    const newTotal = Math.round(Object.values(newApplied).reduce((sum, v) => sum + v, 0) * 100) / 100;
    setPaymentForm({ ...paymentForm, amount: newTotal.toString() });
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = Math.round((parseFloat(paymentForm.amount) || 0) * 100) / 100;
    if (!amount || amount <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }

    const totalApplied = Math.round(Object.values(appliedInvoices).reduce((sum, v) => sum + v, 0) * 100) / 100;
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
        fetchReceipts();
        if (data.data?.id) {
          handlePrintReceipt(data.data.id);
        }
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
  const filteredReceipts = receipts.filter(r => 
    r.customerName.toLowerCase().includes(receiptSearchTerm.toLowerCase()) || 
    (r.reference && r.reference.toLowerCase().includes(receiptSearchTerm.toLowerCase())) ||
    `rec-${r.id.slice(0, 8)}`.toLowerCase().includes(receiptSearchTerm.toLowerCase())
  );
  const globalTotalPending = customers.reduce((sum, c) => sum + c.totalBalance, 0);

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
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
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Gestión de balances pendientes de clientes y registro de cobros.
            </p>
          </div>
          <div className="bg-white px-6 py-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Total Pendiente Global</span>
            <span className="text-2xl font-mono font-bold text-[#C5A059] leading-none mt-1">{fmt(globalTotalPending)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={clsx(
              "px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2",
              activeTab === 'pending'
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <HandCoins className="w-4 h-4" /> Balances de Clientes
          </button>
          <button
            onClick={() => {
              setActiveTab('receipts');
            }}
            className={clsx(
              "px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2",
              activeTab === 'receipts'
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <History className="w-4 h-4" /> Historial de Recibos
          </button>
          <button
            onClick={() => {
              setActiveTab('customer_statement');
            }}
            className={clsx(
              "px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2",
              activeTab === 'customer_statement'
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="w-4 h-4" /> Estado de Cuenta y Abonos
          </button>
        </div>

        {activeTab === 'pending' && (
          <>
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-on-surface-variant" />
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
                  <p className="text-on-surface-variant/70 mt-2">No hay facturas pendientes de cobro en este momento.</p>
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
                        <p className="text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">{customer.invoices.length} {customer.invoices.length === 1 ? 'Factura Pendiente' : 'Facturas Pendientes'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Balance Total</p>
                        <p className="font-mono text-lg font-bold text-rose-600">{fmt(customer.totalBalance)}</p>
                      </div>
                      <button
                        onClick={() => handlePrintCustomerStatement(customer.customerId)}
                        disabled={printingCustomerId === customer.customerId}
                        className="bg-slate-100 hover:bg-slate-200 text-[#003366] border border-slate-350 px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <Printer className="h-4 w-4 text-[#003366]" /> Imprimir
                      </button>
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
                      <thead className="bg-white border-b border-slate-100 text-xs text-on-surface-variant uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3">Factura</th>
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
                              <td className="px-6 py-3 font-mono font-bold text-[#003366]">{inv.codigoFactura || 'N/A'}</td>
                              <td className="px-6 py-3 font-mono text-slate-600">{inv.invoiceNumber}</td>
                              <td className="px-6 py-3 text-on-surface-variant/80">{new Date(inv.invoiceDate).toLocaleDateString('es-DO')}</td>
                              <td className="px-6 py-3">
                                <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium", isOverdue ? 'bg-rose-100 text-rose-700' : 'text-on-surface-variant/80')}>
                                  {isOverdue && <AlertCircle className="w-3 h-3" />}
                                  {new Date(inv.dueDate).toLocaleDateString('es-DO')}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right text-on-surface-variant/70 font-mono">{fmt(inv.amount)}</td>
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
          </>
        )}

        {activeTab === 'receipts' && (
          <>
            {/* Search Bar for Receipts */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1 w-full">
                <label className="block text-xs font-semibold text-primary mb-1">Buscar por Cliente o Referencia</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-on-surface-variant" />
                  </div>
                  <input
                    type="text"
                    placeholder="Ej. Juan Pérez, REC-023a..."
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                    value={receiptSearchTerm}
                    onChange={(e) => setReceiptSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <label className="block text-xs font-semibold text-primary mb-1">Desde</label>
                <input
                  type="date"
                  value={receiptStartDate}
                  onChange={(e) => setReceiptStartDate(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                />
              </div>
              <div className="w-full md:w-48">
                <label className="block text-xs font-semibold text-primary mb-1">Hasta</label>
                <input
                  type="date"
                  value={receiptEndDate}
                  onChange={(e) => setReceiptEndDate(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                />
              </div>
              <button
                type="button"
                onClick={fetchReceipts}
                className="w-full md:w-auto bg-[#003366] hover:bg-[#002244] text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" /> Buscar
              </button>
            </div>

            {/* Receipts Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {receiptsLoading ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : filteredReceipts.length === 0 ? (
                <div className="p-16 text-center">
                  <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-[#003366]">
                    {hasSearched ? 'No se encontraron recibos' : 'Historial de Recibos'}
                  </h3>
                  <p className="text-on-surface-variant/70 mt-2">
                    {hasSearched 
                      ? 'No hay registros que coincidan con los filtros seleccionados.' 
                      : 'Configure los filtros de fecha o búsqueda y presione el botón de "Buscar" para cargar el historial.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-on-surface-variant uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-4">Código Recibo</th>
                        <th className="px-6 py-4">Cliente</th>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Método</th>
                        <th className="px-6 py-4">Referencia</th>
                        <th className="px-6 py-4 text-right">Monto</th>
                        <th className="px-6 py-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredReceipts.map((rec) => {
                        const methodLabel = rec.paymentMethod === 'cash' ? 'Efectivo' : 
                                            rec.paymentMethod === 'bank' ? 'Banco' : 
                                            rec.paymentMethod === 'check' ? 'Cheque' : 'Tarjeta';
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-[#003366]">
                              REC-{rec.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-800">{rec.customerName}</td>
                            <td className="px-6 py-4 text-on-surface-variant/80">
                              {new Date(rec.date).toLocaleDateString('es-DO')}
                            </td>
                            <td className="px-6 py-4">
                              <span className={clsx(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                                rec.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              )}>
                                {methodLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-on-surface-variant/80">{rec.reference || '-'}</td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">{fmt(parseFloat(rec.amount))}</td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex justify-center gap-3">
                                <button
                                  onClick={() => handleOpenReceiptDetails(rec.id)}
                                  className="p-1.5 hover:bg-slate-100 text-slate-600 rounded transition-colors"
                                  title="Ver detalle"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handlePrintReceipt(rec.id)}
                                  className="p-1.5 hover:bg-slate-100 text-[#003366] rounded transition-colors"
                                  title="Imprimir PDF"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'customer_statement' && (
          <>
            {/* Selector de Cliente y Filtros */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-primary mb-1.5">Seleccionar Cliente</label>
                <select
                  value={selectedStatementCustomerId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setSelectedStatementCustomerId(cid);
                    fetchCustomerStatement(cid);
                  }}
                  className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                >
                  <option value="">-- Seleccione un cliente --</option>
                  {statementCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.rncCedula ? `(${c.rncCedula})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full md:w-72">
                <label className="block text-xs font-semibold text-primary mb-1.5">Filtro de búsqueda (Factura, Recibo, Ref)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Filtrar resultados..."
                    className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-all outline-none"
                    value={statementSearch}
                    onChange={(e) => setStatementSearch(e.target.value)}
                  />
                </div>
              </div>

              {selectedStatementCustomerId && statementReceipts.length > 0 && (
                <button
                  type="button"
                  disabled={printingStatement}
                  onClick={handlePrintStatement}
                  className="w-full md:w-auto bg-[#003366] hover:bg-[#002244] text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {printingStatement ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {printingStatement ? 'Generando...' : 'Imprimir Estado'}
                </button>
              )}
            </div>

            {/* Contenedor del Estado de Cuenta */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
              {statementLoading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                </div>
              ) : !selectedStatementCustomerId ? (
                <div className="p-16 text-center">
                  <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-[#003366]">Seleccione un Cliente</h3>
                  <p className="text-on-surface-variant/70 mt-2">
                    Elija un cliente de la lista para ver el estado de cuenta y el historial detallado de abonos.
                  </p>
                </div>
              ) : statementReceipts.length === 0 ? (
                <div className="p-16 text-center">
                  <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-[#003366]">Sin Movimientos</h3>
                  <p className="text-on-surface-variant/70 mt-2">
                    Este cliente no tiene recibos de cobro registrados en el sistema.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto print:overflow-visible">
                  {/* Encabezado visible al imprimir */}
                  <div className="hidden print:block p-6 border-b border-slate-200">
                    <h2 className="text-2xl font-bold text-[#003366]">ESTADO DE CUENTA DE COBROS Y ABONOS</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      <strong>Cliente:</strong> {statementCustomers.find(c => c.id === selectedStatementCustomerId)?.name}
                    </p>
                    <p className="text-xs text-slate-500">Generado el: {new Date().toLocaleString('es-DO')}</p>
                  </div>

                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-on-surface-variant uppercase font-semibold print:bg-transparent">
                      <tr>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Recibo</th>
                        <th className="px-6 py-4">Factura / NCF</th>
                        <th className="px-6 py-4">Mapeo de Pago</th>
                        <th className="px-6 py-4 text-right">Monto Factura</th>
                        <th className="px-6 py-4 text-right">Monto Aplicado (Abono)</th>
                        <th className="px-6 py-4 text-right text-rose-600">Balance Restante</th>
                        <th className="px-6 py-4 text-center print:hidden">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        // Progressive balance calculation grouping by invoiceId
                        const groupedByInvoice: Record<string, any[]> = {};
                        statementReceipts.forEach(item => {
                          const invId = item.invoiceId;
                          if (!groupedByInvoice[invId]) {
                            groupedByInvoice[invId] = [];
                          }
                          groupedByInvoice[invId].push(item);
                        });

                        const processedItems: any[] = [];
                        Object.values(groupedByInvoice).forEach(group => {
                          const sorted = [...group].sort((a, b) => {
                            const dateA = new Date(a.receiptDate).getTime();
                            const dateB = new Date(b.receiptDate).getTime();
                            if (dateA !== dateB) return dateA - dateB;
                            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                          });

                          let runningBalance = sorted[0].invoiceTotal;
                          const computedGroup = sorted.map(item => {
                            runningBalance -= item.amountApplied;
                            return {
                              ...item,
                              progressiveBalance: Math.max(0, runningBalance)
                            };
                          });
                          processedItems.push(...computedGroup);
                        });

                        const sortedFinal = processedItems.sort((a, b) => {
                          const dateA = new Date(a.receiptDate).getTime();
                          const dateB = new Date(b.receiptDate).getTime();
                          if (dateA !== dateB) return dateB - dateA;
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        });

                        const filteredFinal = sortedFinal.filter(item => {
                          if (!statementSearch) return true;
                          const q = statementSearch.toLowerCase();
                          return (
                            item.codigoFactura?.toLowerCase().includes(q) ||
                            item.invoiceNumber?.toLowerCase().includes(q) ||
                            `rec-${item.receiptId.slice(0, 8).toUpperCase()}`.toLowerCase().includes(q) ||
                            item.reference?.toLowerCase().includes(q) ||
                            item.receiptDate.includes(q)
                          );
                        });

                        if (filteredFinal.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                No se encontraron registros que coincidan con la búsqueda.
                              </td>
                            </tr>
                          );
                        }

                        return filteredFinal.map((item) => {
                          const methodLabel = item.paymentMethod === 'cash' ? 'Efectivo' : 
                                              item.paymentMethod === 'bank' ? 'Banco' : 
                                              item.paymentMethod === 'check' ? 'Cheque' : 'Tarjeta';
                          return (
                            <tr key={item.appliedId} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-on-surface-variant/80">
                                {new Date(item.receiptDate).toLocaleDateString('es-DO')}
                              </td>
                              <td className="px-6 py-4 font-mono font-bold text-[#003366]">
                                REC-{item.receiptId.slice(0, 8).toUpperCase()}
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-800">{item.codigoFactura || 'N/A'}</div>
                                {item.invoiceNumber && <div className="text-[10px] text-slate-400 font-mono">{item.invoiceNumber}</div>}
                              </td>
                              <td className="px-6 py-4">
                                <span className={clsx(
                                  "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold",
                                  item.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                )}>
                                  {methodLabel}
                                </span>
                                {item.reference && <span className="block text-[10px] text-slate-500 font-mono mt-0.5">Ref: {item.reference}</span>}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-slate-500">
                                {fmt(item.invoiceTotal)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">
                                {fmt(item.amountApplied)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-rose-600">
                                {fmt(item.progressiveBalance)}
                              </td>
                              <td className="px-6 py-4 text-center print:hidden">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleOpenReceiptDetails(item.receiptId)}
                                    className="p-1.5 hover:bg-slate-100 text-slate-600 rounded transition-colors"
                                    title="Ver Recibo Completo"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handlePrintReceipt(item.receiptId)}
                                    className="p-1.5 hover:bg-slate-100 text-[#003366] rounded transition-colors"
                                    title="Imprimir Recibo"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* MODAL: REGISTRAR COBRO */}
      <AnimatePresence>
        {showPaymentModal && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPaymentModal(false)} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl w-full max-w-5xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden">
              <div className="bg-[#001733] border-b border-[#003366] px-6 py-5 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-white font-display font-bold text-xl flex items-center gap-2"><HandCoins className="w-6 h-6 text-[#C5A059]" /> Registrar Recibo de Cobro</h3>
                  <p className="text-[#c5a059]/80 text-sm mt-0.5">{selectedCustomer.customerName}</p>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex flex-col md:flex-row overflow-hidden flex-1">
                {/* Left Column: Form Settings */}
                <div className="md:w-1/3 bg-surface-container-highest border-r border-outline/40 p-6 space-y-5 overflow-y-auto shrink-0">
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5"><Calendar className="w-3 h-3 inline mr-1 text-[#C5A059]" /> Fecha de Cobro</label>
                    <input type="date" required value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full bg-white border border-outline/40 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-sm text-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5"><CreditCard className="w-3 h-3 inline mr-1 text-[#C5A059]" /> Método de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPaymentForm({ ...paymentForm, paymentMethod: 'bank' })} className={clsx("py-2 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-colors", paymentForm.paymentMethod === 'bank' ? 'bg-[#c5a059] border-[#c5a059] text-[#001733]' : 'bg-white border-outline/40 text-[#001733] hover:text-[#c5a059]')}>
                        <Landmark className="w-4 h-4" /> Banco
                      </button>
                      <button type="button" onClick={() => setPaymentForm({ ...paymentForm, paymentMethod: 'cash', reference: '' })} className={clsx("py-2 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-colors", paymentForm.paymentMethod === 'cash' ? 'bg-[#c5a059] border-[#c5a059] text-[#001733]' : 'bg-white border-outline/40 text-[#001733] hover:text-[#c5a059]')}>
                        <HandCoins className="w-4 h-4" /> Caja Chica
                      </button>
                    </div>
                    {paymentForm.paymentMethod === 'cash' && (
                      <p className="text-[10px] text-amber-600 mt-2 font-medium flex items-center gap-1 bg-amber-50 p-2 rounded border border-amber-500/30">
                        <AlertCircle className="w-3 h-3" /> Este cobro se agregará directamente al arqueo de tu sesión de caja actual.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5">Monto Recibido</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                      <input type="number" min="0.01" step="0.01" required value={paymentForm.amount} onChange={handleAmountChange} className="w-full bg-white border border-outline/40 rounded-lg pl-8 pr-3 py-2.5 outline-none focus:border-[#C5A059] font-mono text-lg font-bold text-primary transition-colors" placeholder="0.00" />
                    </div>
                    <button
                      type="button"
                      onClick={handleDistributeAmount}
                      className="w-full mt-2 bg-[#001733] hover:bg-[#00254d] text-[#C5A059] border border-[#003366] rounded-lg py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Distribuir en Facturas
                    </button>
                    <p className="text-[10px] text-slate-500 mt-1">Presiona para auto-distribuir el monto en las facturas más antiguas.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5">Referencia (Cheque/Transfer)</label>
                    <input
                      type="text"
                      disabled={paymentForm.paymentMethod !== 'bank'}
                      value={paymentForm.reference}
                      onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                      className="w-full bg-white border border-outline/40 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-sm font-mono text-primary transition-colors disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      placeholder={paymentForm.paymentMethod === 'bank' ? "Ej. TX-98442" : "No requerido para caja chica"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5">Nota Interna (Opcional)</label>
                    <textarea value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={2} className="w-full bg-white border border-outline/40 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-sm text-primary resize-none transition-colors"></textarea>
                  </div>
                </div>

                {/* Right Column: Invoice Application */}
                <div className="md:w-2/3 bg-white flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#003366] bg-[#001733] shrink-0">
                    <h4 className="font-bold text-white">Aplicación del Pago</h4>
                    <p className="text-xs text-[#c5a059]/80">Distribuye el monto recibido en las facturas pendientes a continuación.</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-[#001733] uppercase font-bold tracking-widest border-b border-slate-200">
                        <tr>
                          <th className="px-4 pb-3">Factura</th>
                          <th className="px-4 pb-3">NCF / Documento</th>
                          <th className="px-4 pb-3 text-right">Vencimiento</th>
                          <th className="px-4 pb-3 text-right">Balance Original</th>
                          <th className="px-4 pb-3 text-right w-40">Monto a Aplicar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedCustomer.invoices.map(inv => {
                          const applied = appliedInvoices[inv.arId] || 0;
                          return (
                            <tr key={inv.arId} className={clsx("transition-colors", applied > 0 ? 'bg-emerald-50' : 'hover:bg-slate-50')}>
                              <td className="px-4 py-3.5">
                                <span className="font-mono font-bold text-primary block">{inv.codigoFactura || 'N/A'}</span>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="font-mono text-slate-600 block">{inv.invoiceNumber}</span>
                              </td>
                              <td className="px-4 py-3.5 text-right text-on-surface-variant">{new Date(inv.dueDate).toLocaleDateString('es-DO')}</td>
                              <td className="px-4 py-3.5 text-right font-mono font-bold text-primary">{fmt(inv.balance)}</td>
                              <td className="px-4 py-3.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={inv.balance}
                                  step="0.01"
                                  value={applied || ''}
                                  onChange={(e) => handleManualApplyChange(inv.arId, e.target.value, inv.balance)}
                                  className={clsx("w-full border rounded px-2 py-1.5 text-right font-mono text-sm outline-none focus:ring-1 transition-all", applied > 0 ? 'border-emerald-500 bg-emerald-50 focus:ring-emerald-500 text-emerald-700 font-bold' : 'border-outline/40 bg-white text-primary focus:border-[#c5a059]')}
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
                  <div className="bg-[#001733] border-t border-[#003366] p-6 shrink-0 flex items-center justify-between">
                    <div className="flex gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Monto Recibido</p>
                        <p className="font-mono text-xl font-bold text-white">{fmt(Math.round((parseFloat(paymentForm.amount) || 0) * 100) / 100)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Aplicado</p>
                        {(() => {
                          const totalApplied = Math.round(Object.values(appliedInvoices).reduce((s, v) => s + v, 0) * 100) / 100;
                          const amountReceived = Math.round((parseFloat(paymentForm.amount) || 0) * 100) / 100;
                          const match = Math.abs(amountReceived - totalApplied) < 0.01;
                          return (
                            <p className={clsx("font-mono text-xl font-bold", match ? 'text-emerald-400' : 'text-rose-400')}>
                              {fmt(totalApplied)}
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    <button type="button" onClick={handleSubmitPayment} disabled={submitting} className="bg-[#C5A059] hover:bg-[#b08c4a] text-[#001e40] font-bold py-3 px-8 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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

      {/* MODAL: DETALLE DEL RECIBO */}
      <AnimatePresence>
        {showReceiptDetailsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReceiptDetailsModal(false)} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="bg-[#003366] px-6 py-4 flex justify-between items-center text-white shrink-0">
                <div>
                  <h3 className="font-display font-bold text-lg">Detalle de Recibo de Ingreso</h3>
                  {selectedReceipt && <p className="text-xs text-[#C5A059] font-mono">REC-{selectedReceipt.id.slice(0, 8).toUpperCase()}</p>}
                </div>
                <button onClick={() => setShowReceiptDetailsModal(false)} className="text-slate-300 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
              </div>

              {loadingReceiptDetails || !selectedReceipt ? (
                <div className="flex-1 flex justify-center items-center py-20">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#C5A059]" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Header info */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cliente</p>
                      <p className="font-semibold text-slate-800 text-sm">{selectedReceipt.customerName}</p>
                      {selectedReceipt.customerRnc && <p className="text-xs text-slate-500">RNC: {selectedReceipt.customerRnc}</p>}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Detalles de Cobro</p>
                      <p className="text-xs text-slate-700"><strong>Fecha:</strong> {new Date(selectedReceipt.date).toLocaleDateString('es-DO')}</p>
                      <p className="text-xs text-slate-700"><strong>Método:</strong> {selectedReceipt.paymentMethod === 'cash' ? 'Efectivo' : 'Banco'}</p>
                      {selectedReceipt.reference && <p className="text-xs text-slate-700"><strong>Referencia:</strong> {selectedReceipt.reference}</p>}
                    </div>
                  </div>

                  {/* Facturas aplicadas */}
                  <div>
                    <h4 className="font-bold text-[#003366] text-sm mb-3">Facturas Amortizadas</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden font-sans">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">NCF / Documento</th>
                            <th className="px-4 py-3 text-right">Monto Original</th>
                            <th className="px-4 py-3 text-right">Monto Aplicado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedReceipt.appliedInvoices.map((inv: any) => (
                            <tr key={inv.appliedId} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-mono font-bold text-[#003366]">{inv.invoiceNumber}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(inv.totalAmount)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{fmt(inv.amountApplied)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedReceipt.notes && (
                    <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-4 text-xs text-amber-800">
                      <p className="font-bold mb-1">Notas / Observaciones:</p>
                      <p>{selectedReceipt.notes}</p>
                    </div>
                  )}

                  {/* Total summary */}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <span className="text-sm font-bold text-slate-600">Total Recibido</span>
                    <span className="text-2xl font-mono font-bold text-emerald-600">{fmt(selectedReceipt.amount)}</span>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setShowReceiptDetailsModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
                >
                  Cerrar
                </button>
                {selectedReceipt && (
                  <button
                    onClick={() => handlePrintReceipt(selectedReceipt.id)}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Recibo
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
