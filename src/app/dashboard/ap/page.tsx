'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Search, Receipt, RefreshCw, X, HandCoins, Building2, Calendar,
  CreditCard, Landmark, CheckCircle2, AlertCircle, FileSignature,
  HelpCircle, Settings, Check, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { SearchBar } from '@/components/ui/search-bar';

// -- Types --
interface BillAP {
  apId: string;
  amount: number;
  balance: number;
  dueDate: string;
  status: string;
}

interface SupplierAP {
  supplierId: string;
  supplierName: string;
  totalBalance: number;
  bills: BillAP[];
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  balance: string;
}

interface PaymentHistory {
  id: string;
  apId: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  supplierName: string;
  debitAccountName: string;
  debitAccountCode: string;
  creditAccountName: string;
  creditAccountCode: string;
  checkNumber?: string;
  dueDate?: string;
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function AccountsPayablePage() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierAP[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccountsList, setBankAccountsList] = useState<BankAccount[]>([]);
  const [paymentsList, setPaymentsList] = useState<PaymentHistory[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [paymentsStartDate, setPaymentsStartDate] = useState('');
  const [paymentsEndDate, setPaymentsEndDate] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'bills' | 'guarantees' | 'history'>('bills');

  const [printingSupplierId, setPrintingSupplierId] = useState<string | null>(null);

  // Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyingGuarantees, setApplyingGuarantees] = useState(false);

  // Selected Payment State
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierAP | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillAP | null>(null);

  // Form State
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank' as 'cash' | 'transfer' | 'check',
    amount: '',
    debitAccountId: '',
    creditAccountId: '',
    bankAccountId: '',
    checkNumber: '',
    payee: '',
    isGuarantee: false,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default +1 month
    reference: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
    fetchSecondaryData();
  }, []);

  useEffect(() => {
    fetchPaymentsData();
  }, [paymentsPage, paymentsStartDate, paymentsEndDate]); // Fetch when page or dates change

  const fetchPaymentsData = async (searchOverride?: string) => {
    setPaymentsLoading(true);
    try {
      const qSearch = searchOverride !== undefined ? searchOverride : paymentsSearch;
      
      const query = new URLSearchParams({
        payments: 'true',
        page: paymentsPage.toString(),
        pageSize: '20'
      });
      if (qSearch) query.append('search', qSearch);
      if (paymentsStartDate) query.append('startDate', paymentsStartDate);
      if (paymentsEndDate) query.append('endDate', paymentsEndDate);

      const res = await fetch(`/api/v1/ap?${query.toString()}`);
      const json = await res.json();
      
      if (json.success && json.data) {
        setPaymentsList(json.data.items || []);
        setPaymentsTotal(json.data.total || 0);
        setPaymentsTotalPages(json.data.totalPages || 1);
      }
    } catch (err) {
      toast.error('Error de red al cargar el historial de pagos');
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handlePaymentsSearch = (val: string) => {
    setPaymentsSearch(val);
    setPaymentsPage(1); // Reset page on new search
  };

  const handlePaymentsSearchSubmit = () => {
    setPaymentsPage(1);
    fetchPaymentsData();
  };

  const handlePrintSupplierAP = async (supplierId: string) => {
    const toastId = toast.loading('Generando reporte de cuentas por pagar...');
    setPrintingSupplierId(supplierId);
    try {
      const res = await fetch('/api/v1/ap/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId })
      });
      const data = await res.json();
      if (data.success && data.url) {
        toast.success('PDF generado con éxito', { id: toastId });
        window.open(data.url, '_blank');
      } else {
        toast.error(data.error?.message || 'Error al generar PDF del reporte', { id: toastId });
      }
    } catch (err) {
      toast.error('Error de red al generar PDF', { id: toastId });
    } finally {
      setPrintingSupplierId(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const apRes = await fetch('/api/v1/ap');
      const apData = await apRes.json();
      if (apData.success) setSuppliers(apData.data || []);
    } catch (err) {
      toast.error('Error de red al cargar datos principales');
    } finally {
      setLoading(false);
    }
  };

  const fetchSecondaryData = async () => {
    try {
      const [accountsRes, banksRes] = await Promise.all([
        fetch('/api/v1/accounting/accounts'),
        fetch('/api/v1/bank/accounts')
      ]);

      const accountsData = await accountsRes.json();
      const banksData = await banksRes.json();

      if (accountsData.success) {
        setAccounts(accountsData.data || []);
      }
      if (banksData.success) {
        setBankAccountsList(banksData.data || []);
      }
    } catch (err) {
      console.error('Error fetching configuration accounts', err);
    }
  };

  const handleOpenPayment = (supplier: SupplierAP, bill: BillAP) => {
    setSelectedSupplier(supplier);
    setSelectedBill(bill);

    // Auto-detect default debit account (Liability/Accounts Payable)
    const defaultDebit = accounts.find(
      a => a.type === 'liability' && (a.name.toLowerCase().includes('pagar') || a.code.startsWith('2.1.01'))
    )?.id || '';

    // Auto-detect default credit account based on initial method (bank)
    const defaultCredit = accounts.find(
      a => a.type === 'asset' && (a.name.toLowerCase().includes('banco') || a.code.startsWith('1.1.02'))
    )?.id || '';

    setPaymentForm({
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'transfer',
      amount: bill.balance.toString(),
      debitAccountId: defaultDebit,
      creditAccountId: defaultCredit,
      bankAccountId: bankAccountsList[0]?.id || '',
      checkNumber: '',
      payee: supplier.supplierName,
      isGuarantee: false,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reference: '',
      notes: ''
    });

    setShowPaymentModal(true);
  };

  const handleMethodChange = (method: 'cash' | 'transfer' | 'check') => {
    let creditId = paymentForm.creditAccountId;

    if (method === 'cash') {
      creditId = accounts.find(
        a => a.type === 'asset' && (a.name.toLowerCase().includes('caja') || a.code.startsWith('1.1.01'))
      )?.id || creditId;
    } else {
      creditId = accounts.find(
        a => a.type === 'asset' && (a.name.toLowerCase().includes('banco') || a.code.startsWith('1.1.02'))
      )?.id || creditId;
    }

    setPaymentForm(prev => ({
      ...prev,
      paymentMethod: method,
      creditAccountId: creditId
    }));
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    const amountVal = parseFloat(paymentForm.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Ingrese un monto válido mayor a cero.');
      return;
    }

    if (amountVal > selectedBill.balance) {
      toast.error(`El monto del pago no puede exceder el balance de la factura ($${selectedBill.balance}).`);
      return;
    }

    if (!paymentForm.debitAccountId || !paymentForm.creditAccountId) {
      toast.error('Debe configurar las cuentas contables de débito y crédito.');
      return;
    }

    if (paymentForm.paymentMethod === 'check') {
      if (!paymentForm.bankAccountId || !paymentForm.checkNumber || !paymentForm.payee) {
        toast.error('Por favor, complete todos los datos del cheque.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/ap/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apId: selectedBill.apId,
          amount: amountVal,
          paymentMethod: paymentForm.paymentMethod === 'transfer' ? 'transfer' : paymentForm.paymentMethod,
          debitAccountId: paymentForm.debitAccountId,
          creditAccountId: paymentForm.creditAccountId,
          paymentDate: paymentForm.date,
          bankAccountId: paymentForm.paymentMethod === 'check' ? paymentForm.bankAccountId : undefined,
          checkNumber: paymentForm.paymentMethod === 'check' ? paymentForm.checkNumber : undefined,
          payee: paymentForm.paymentMethod === 'check' ? paymentForm.payee : undefined,
          isGuarantee: paymentForm.paymentMethod === 'check' ? paymentForm.isGuarantee : false,
          dueDate: (paymentForm.paymentMethod === 'check' && paymentForm.isGuarantee) ? paymentForm.dueDate : undefined,
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(
          paymentForm.isGuarantee
            ? 'Cheque en garantía registrado con éxito'
            : 'Pago registrado y aplicado a la contabilidad.'
        );
        setShowPaymentModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al procesar pago');
      }
    } catch (error) {
      toast.error('Error de red al procesar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyDueGuarantees = async () => {
    setApplyingGuarantees(true);
    try {
      const res = await fetch('/api/v1/ap/payments/apply-guarantees', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Garantías procesadas con éxito', {
          description: data.message
        });
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al procesar cheques en garantía');
      }
    } catch (error) {
      toast.error('Error de red al procesar garantías diferidas');
    } finally {
      setApplyingGuarantees(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => s.supplierName.toLowerCase().includes(searchTerm.toLowerCase()));
  const globalTotalPending = suppliers.reduce((sum, s) => sum + s.totalBalance, 0);

  // Filter pending guarantee checks
  const pendingGuarantees = paymentsList.filter(p => p.status === 'pending_guarantee');
  const nowStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-full bg-background text-on-surface font-sans pb-20 max-w-7xl mx-auto w-full">

      {/* Environment Indicator */}
      <div className="bg-[#002b49] w-full px-8 py-1.5 flex justify-end items-center border-b border-outline-variant/30">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-amber-500" /> Cuentas por Pagar & Garantías
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-[#003366] dark:text-white tracking-tight flex items-center gap-2">
              <Receipt className="h-8 w-8 text-amber-500" />
              Módulo de Cuentas por Pagar
            </h1>
            <p className="text-on-surface-variant dark:text-white/70 text-sm mt-1.5">
              Gestione balances pendientes de proveedores, configure asientos contables y aplique cheques en garantía diferidos.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-surface-container-low px-6 py-4 rounded-xl border border-outline-variant/30 shadow-lg flex flex-col items-end min-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant/70">Deuda Total Acumulada</span>
              <span className="text-2xl font-mono font-bold text-rose-500 mt-1">{fmt(globalTotalPending)}</span>
            </div>
            <div className="bg-surface-container-low px-6 py-4 rounded-xl border border-outline-variant/30 shadow-lg flex flex-col items-end min-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant/70">Cheques en Garantía</span>
              <span className="text-2xl font-mono font-bold text-amber-500 mt-1">{pendingGuarantees.length}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-850 gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('bills')}
            className={clsx(
              "pb-3 text-sm font-bold transition-all border-b-2 px-1",
              activeTab === 'bills' ? 'border-amber-500 text-amber-500' : 'border-transparent text-on-surface-variant hover:text-primary'
            )}
          >
            Cuentas por Pagar (Facturas)
          </button>
          <button
            onClick={() => setActiveTab('guarantees')}
            className={clsx(
              "pb-3 text-sm font-bold transition-all border-b-2 px-1 flex items-center gap-2",
              activeTab === 'guarantees' ? 'border-amber-500 text-amber-500' : 'border-transparent text-on-surface-variant hover:text-primary'
            )}
          >
            Cheques en Garantía
            {pendingGuarantees.length > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-bold">
                {pendingGuarantees.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={clsx(
              "pb-3 text-sm font-bold transition-all border-b-2 px-1",
              activeTab === 'history' ? 'border-amber-500 text-amber-500' : 'border-transparent text-on-surface-variant hover:text-primary'
            )}
          >
            Historial de Pagos
          </button>
        </div>

        {/* Main Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'bills' && (
            <motion.div
              key="bills" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Search Bar */}
              <SearchBar
                placeholder="Buscar por proveedor..."
                value={searchTerm}
                onChange={(val) => setSearchTerm(val)}
              />

              {/* Bills Table */}
              {loading ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-amber-500" /></div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 p-16 text-center shadow-lg">
                  <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-primary">¡Al día con los proveedores!</h3>
                  <p className="text-on-surface-variant mt-2">No se encontraron deudas comerciales pendientes de pago.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSuppliers.map(supplier => (
                    <div key={supplier.supplierId} className="bg-surface-container-low rounded-xl shadow-lg border border-slate-850 overflow-hidden">

                      {/* Supplier Row */}
                      <div className="bg-surface-container-low/60 border-b border-slate-850 p-5 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center border border-amber-500/20">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-primary">{supplier.supplierName}</h3>
                            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">{supplier.bills.length} factura(s) pendiente(s)</p>
                          </div>
                        </div>
                         <div className="flex items-center gap-6">
                          <button
                            onClick={() => handlePrintSupplierAP(supplier.supplierId)}
                            disabled={printingSupplierId === supplier.supplierId}
                            className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                            title="Imprimir Cuentas por Pagar"
                          >
                            <Printer className="w-4 h-4 text-amber-500" />
                            <span>Imprimir</span>
                          </button>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Balance Total</p>
                            <p className="font-mono text-lg font-bold text-rose-500">{fmt(supplier.totalBalance)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Bill Detail List */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-background/40 text-xs text-on-surface-variant/70 uppercase font-bold border-b border-slate-850">
                            <tr>
                              <th className="px-6 py-3.5">Referencia CXP</th>
                              <th className="px-6 py-3.5">Vencimiento</th>
                              <th className="px-6 py-3.5 text-right">Monto Original</th>
                              <th className="px-6 py-3.5 text-right">Balance Pendiente</th>
                              <th className="px-6 py-3.5 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {supplier.bills.map(bill => {
                              const isOverdue = new Date(bill.dueDate) < new Date();
                              return (
                                <tr key={bill.apId} className="hover:bg-slate-850/30 transition-colors">
                                  <td className="px-6 py-4 font-mono font-bold text-amber-500">{bill.apId.slice(0, 8).toUpperCase()}</td>
                                  <td className="px-6 py-4">
                                    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold", isOverdue ? 'bg-rose-500/20 text-rose-400 border border-rose-500/10' : 'text-on-surface-variant')}>
                                      {isOverdue && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                                      {new Date(bill.dueDate).toLocaleDateString('es-DO')}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right text-on-surface-variant font-mono">{fmt(bill.amount)}</td>
                                  <td className="px-6 py-4 text-right font-mono font-bold text-primary">{fmt(bill.balance)}</td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() => handleOpenPayment(supplier, bill)}
                                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-[0.98]"
                                    >
                                      Registrar Pago
                                    </button>
                                  </td>
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
            </motion.div>
          )}

          {activeTab === 'guarantees' && (
            <motion.div
              key="guarantees" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Guarantee Control Bar */}
              <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/30 shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="font-bold text-lg text-primary">Procesamiento de Garantías diferidas</h3>
                  <p className="text-on-surface-variant text-xs mt-1">Aplique los cheques en garantía cuya fecha de liberación ya haya llegado a hoy.</p>
                </div>
                <button
                  onClick={handleApplyDueGuarantees}
                  disabled={applyingGuarantees || pendingGuarantees.length === 0}
                  className="bg-[#003366] hover:bg-[#002244] disabled:cursor-not-allowed text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm justify-center"
                >
                  {applyingGuarantees ? (
                    <><RefreshCw className="h-4.5 w-4.5 animate-spin" /> Procesando...</>
                  ) : (
                    <><CheckCircle2 className="h-4.5 w-4.5" /> Aplicar Cheques Vencidos</>
                  )}
                </button>
              </div>

              {/* Guarantees List */}
              <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-background/40 text-xs text-on-surface-variant/70 uppercase font-bold border-b border-slate-850">
                      <tr>
                        <th className="px-6 py-3.5">No. Cheque</th>
                        <th className="px-6 py-3.5">Proveedor Beneficiario</th>
                        <th className="px-6 py-3.5 text-right">Monto Cheque</th>
                        <th className="px-6 py-3.5 text-center">Fecha Cobro</th>
                        <th className="px-6 py-3.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {pendingGuarantees.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-on-surface-variant/70">
                            No hay cheques en garantía diferidos en este momento.
                          </td>
                        </tr>
                      ) : (
                        pendingGuarantees.map(payment => {
                          const isDue = payment.dueDate ? payment.dueDate <= nowStr : false;
                          return (
                            <tr key={payment.id} className={clsx("hover:bg-slate-850/30 transition-colors", isDue ? 'bg-amber-500/5' : '')}>
                              <td className="px-6 py-4 font-mono font-bold text-amber-500">{payment.checkNumber || 'S/N'}</td>
                              <td className="px-6 py-4 text-primary font-bold">{payment.supplierName}</td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-primary">{fmt(parseFloat(payment.amount))}</td>
                              <td className="px-6 py-4 text-center text-on-surface-variant font-mono">
                                {payment.dueDate ? new Date(payment.dueDate).toLocaleDateString('es-DO') : '-'}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={clsx(
                                  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold border",
                                  isDue
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/20'
                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/20'
                                )}>
                                  {isDue ? 'Vencido (Listo)' : 'Pendiente garantía'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Filtros */}
              <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex-1 w-full max-w-sm">
                  <SearchBar 
                    placeholder="Buscar suplidor o cheque..." 
                    value={paymentsSearch} 
                    onChange={handlePaymentsSearch} 
                  />
                </div>
                <div className="flex items-center gap-4 text-sm w-full md:w-auto">
                  <div className="flex flex-col gap-1 w-full md:w-auto">
                    <label className="text-xs text-on-surface-variant font-bold">Desde</label>
                    <input 
                      type="date" 
                      value={paymentsStartDate} 
                      onChange={(e) => setPaymentsStartDate(e.target.value)}
                      className="bg-background border border-outline-variant rounded-md px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-full md:w-auto">
                    <label className="text-xs text-on-surface-variant font-bold">Hasta</label>
                    <input 
                      type="date" 
                      value={paymentsEndDate} 
                      onChange={(e) => setPaymentsEndDate(e.target.value)}
                      className="bg-background border border-outline-variant rounded-md px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <button 
                    onClick={() => { setPaymentsStartDate(''); setPaymentsEndDate(''); setPaymentsSearch(''); setPaymentsPage(1); }}
                    className="mt-5 px-3 py-1.5 border border-outline-variant hover:bg-outline-variant/20 rounded-md transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabla */}
              <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-background/40 text-xs text-on-surface-variant/70 uppercase font-bold border-b border-slate-850">
                    <tr>
                      <th className="px-6 py-3.5">Fecha</th>
                      <th className="px-6 py-3.5">Proveedor</th>
                      <th className="px-6 py-3.5">Método</th>
                      <th className="px-6 py-3.5">Débito (Pasivo)</th>
                      <th className="px-6 py-3.5">Crédito (Activo)</th>
                      <th className="px-6 py-3.5 text-right">Monto</th>
                      <th className="px-6 py-3.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {paymentsList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-on-surface-variant/70">
                          No se han registrado pagos en el historial.
                        </td>
                      </tr>
                    ) : (
                      paymentsList.map(p => (
                        <tr key={p.id} className="hover:bg-slate-850/30 transition-colors">
                          <td className="px-6 py-4 text-on-surface-variant text-xs font-mono">{new Date(p.paymentDate).toLocaleDateString('es-DO')}</td>
                          <td className="px-6 py-4 text-primary font-bold">{p.supplierName}</td>
                          <td className="px-6 py-4">
                            <span className="capitalize text-on-surface-variant text-xs">
                              {p.paymentMethod === 'check'
                                ? `Cheque (${p.checkNumber || 'S/N'})`
                                : p.paymentMethod === 'transfer'
                                  ? 'Transferencia'
                                  : 'Efectivo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-on-surface-variant text-xs font-mono" title={p.debitAccountName}>
                            {p.debitAccountCode}
                          </td>
                          <td className="px-6 py-4 text-on-surface-variant text-xs font-mono" title={p.creditAccountName}>
                            {p.creditAccountCode}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-primary">{fmt(parseFloat(p.amount))}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={clsx(
                              "inline-flex px-2 py-0.5 rounded text-xs font-bold border",
                              p.status === 'applied'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/20'
                            )}>
                              {p.status === 'applied' ? 'Aplicado' : 'Pendiente garantía'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              
              {/* Paginación */}
              {paymentsTotalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-850 bg-background/20">
                  <span className="text-xs text-on-surface-variant font-mono">
                    Mostrando página {paymentsPage} de {paymentsTotalPages} ({paymentsTotal} registros)
                  </span>
                  <div className="flex gap-2">
                    <button 
                      disabled={paymentsPage <= 1}
                      onClick={() => setPaymentsPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1 bg-surface-container border border-outline-variant rounded hover:bg-outline-variant/20 disabled:opacity-50 text-xs font-bold transition-colors"
                    >
                      Anterior
                    </button>
                    <button 
                      disabled={paymentsPage >= paymentsTotalPages}
                      onClick={() => setPaymentsPage(p => Math.min(paymentsTotalPages, p + 1))}
                      className="px-3 py-1 bg-surface-container border border-outline-variant rounded hover:bg-outline-variant/20 disabled:opacity-50 text-xs font-bold transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* MODAL: REGISTRAR PAGO (With Ledger configuration) */}
      <AnimatePresence>
        {showPaymentModal && selectedSupplier && selectedBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPaymentModal(false)} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative z-10 flex flex-col w-full max-w-2xl max-h-[95vh] bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733] shrink-0">
                <div>
                  <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                    <FileSignature className="w-5 h-5 text-[#c5a059]" /> Registrar Pago Contable
                  </h3>
                  <p className="text-[#c5a059]/80 text-xs mt-1 font-mono">{selectedSupplier.supplierName} • Factura ID: {selectedBill.apId.slice(0, 8).toUpperCase()}</p>
                </div>
                <button onClick={() => setShowPaymentModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmitPayment} className="p-6 space-y-5 overflow-y-auto flex-1">

                {/* Basic fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Fecha de Pago</label>
                    <input
                      type="date" required
                      value={paymentForm.date}
                      onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Método de Pago</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={e => handleMethodChange(e.target.value as any)}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                    >
                      <option value="transfer">Transferencia Bancaria</option>
                      <option value="check">Cheque Bancario</option>
                      <option value="cash">Efectivo / Caja Chica</option>
                    </select>
                  </div>
                </div>

                {/* Configurable Accounting Accounts */}
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline/30 space-y-4">
                  <div className="flex items-center gap-1.5 text-xs text-[#c5a059] font-bold uppercase tracking-wider">
                    <Settings className="w-4 h-4" /> Configuración de Cuentas
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Débito (CXP - Pasivo)</label>
                      <select
                        required
                        value={paymentForm.debitAccountId}
                        onChange={e => setPaymentForm({ ...paymentForm, debitAccountId: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                      >
                        <option value="">-- Seleccionar cuenta --</option>
                        {accounts
                          .filter(a => a.type === 'liability' || a.type === 'expense')
                          .map(a => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Crédito (Activo - Banco/Caja)</label>
                      <select
                        required
                        value={paymentForm.creditAccountId}
                        onChange={e => setPaymentForm({ ...paymentForm, creditAccountId: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                      >
                        <option value="">-- Seleccionar cuenta --</option>
                        {accounts
                          .filter(a => a.type === 'asset')
                          .map(a => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Monto a Amortizar / Pagar</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                      <input
                        type="number" min="0.01" step="0.01" required
                        value={paymentForm.amount}
                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg pl-8 pr-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <span className="text-[10px] text-on-surface-variant block mt-1">Deuda máxima: {fmt(selectedBill.balance)}</span>
                  </div>
                  {paymentForm.paymentMethod !== 'check' && (
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Referencia (Opcional)</label>
                      <input
                        type="text"
                        value={paymentForm.reference}
                        onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono"
                        placeholder="Ref / Transfer #"
                      />
                    </div>
                  )}
                </div>

                {/* Cash Method Warning */}
                {paymentForm.paymentMethod === 'cash' && (
                  <div className="text-xs text-amber-500 font-medium bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Este pago se descontará de la caja chica y afectará el balance esperado de su sesión actual.</span>
                  </div>
                )}

                {/* Check Specific Details */}
                {paymentForm.paymentMethod === 'check' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="bg-surface-container-low p-4 rounded-xl border border-outline/30 space-y-4 overflow-hidden"
                  >
                    <div className="text-xs text-[#c5a059] font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Landmark className="w-4 h-4" /> Datos de Emisión del Cheque
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-primary block mb-1">Cuenta Bancaria</label>
                        <select
                          value={paymentForm.bankAccountId}
                          onChange={e => setPaymentForm({ ...paymentForm, bankAccountId: e.target.value })}
                          className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                        >
                          <option value="">-- Seleccionar Banco --</option>
                          {bankAccountsList.map(b => (
                            <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber} ({fmt(parseFloat(b.balance))})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-primary block mb-1">No. Cheque</label>
                        <input
                          type="text"
                          value={paymentForm.checkNumber}
                          onChange={e => setPaymentForm({ ...paymentForm, checkNumber: e.target.value })}
                          className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono"
                          placeholder="Ej. 000192"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-primary block mb-1">A Favor De (Beneficiario)</label>
                        <input
                          type="text"
                          value={paymentForm.payee}
                          onChange={e => setPaymentForm({ ...paymentForm, payee: e.target.value })}
                          className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors"
                          placeholder="Beneficiario"
                        />
                      </div>
                    </div>

                    {/* Guarantee check configuration */}
                    <div className="border-t border-outline/30 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={paymentForm.isGuarantee}
                          onChange={e => setPaymentForm({ ...paymentForm, isGuarantee: e.target.checked })}
                          className="rounded bg-surface-container-highest border-outline text-[#c5a059] focus:ring-[#c5a059] focus:ring-offset-0 focus:ring-1 w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <span className="text-sm font-semibold text-primary block">Cheque en Garantía (Post-fechado)</span>
                          <span className="text-[10px] text-on-surface-variant">El pago no se aplica a la deuda hasta la fecha de cobro.</span>
                        </div>
                      </label>

                      {paymentForm.isGuarantee && (
                        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="w-full sm:w-auto">
                          <label className="text-sm font-semibold text-primary block mb-1">Fecha de Cobro</label>
                          <input
                            type="date"
                            value={paymentForm.dueDate}
                            onChange={e => setPaymentForm({ ...paymentForm, dueDate: e.target.value })}
                            className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono"
                          />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Notes */}
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Nota Interna (Opcional)</label>
                  <textarea
                    value={paymentForm.notes}
                    onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors resize-none"
                    placeholder="Detalles sobre el pago..."
                  ></textarea>
                </div>

                {/* Footer buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-bold border border-rose-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50"
                  >
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {paymentForm.isGuarantee ? 'Registrar Garantía' : 'Procesar'}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
