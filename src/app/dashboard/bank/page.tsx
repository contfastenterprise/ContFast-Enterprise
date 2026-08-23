'use client';

import { useState, useEffect } from 'react';
import { Landmark, Plus, ArrowRightLeft, RefreshCw, X, CreditCard, Building2, CheckCircle2, ArrowDownRight, ArrowUpRight, DollarSign, Search, Printer, Info } from 'lucide-react';
import DateRangePicker from '@/components/ui/date-range-picker';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  type: string;
  balance: string;
  status: string;
  color?: string;
}

interface BankTransaction {
  id: string;
  date: string;
  type: string;
  amount: string;
  reference: string;
  description: string;
  status: string;
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

const fmt = (val: string | number, currency = 'DOP') => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency }).format(Number(val) || 0);
};

const maskAccount = (acc: string) => {
  if (!acc || acc.length < 4) return acc;
  return `****${acc.slice(-4)}`;
};

export default function BankAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartAccount[]>([]);

  // Modals
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [bankSearch, setBankSearch] = useState('');

  // Forms
  const [accountForm, setAccountForm] = useState({
    bankName: '',
    accountNumber: '',
    currency: 'DOP',
    type: 'corriente',
    color: '#003366',
    initialBalance: ''
  });

  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'deposit',
    amount: '',
    reference: '',
    description: '',
    contraAccountId: ''
  });

  useEffect(() => {
    fetchAccounts();
    fetchChartOfAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchTransactions(selectedAccount.id);
    } else {
      setTransactions([]);
    }
  }, [selectedAccount, startDate, endDate]);

  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/bank/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
      }
    } catch (err) {
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  };

  async function fetchTransactions(accountId: string) {
    setLoadingTxs(true);
    try {
      const params = new URLSearchParams({ accountId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await fetch(`/api/v1/bank/transactions?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
      }
    } catch (err) {
      toast.error('Error al cargar transacciones');
    } finally {
      setLoadingTxs(false);
    }
  };

  async function fetchChartOfAccounts() {
    try {
      const res = await fetch('/api/v1/accounting/accounts');
      const data = await res.json();
      if (data.success) {
        setChartOfAccounts(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/bank/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...accountForm,
          initialBalance: parseFloat(accountForm.initialBalance) || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cuenta creada exitosamente');
        setShowNewAccountModal(false);
        fetchAccounts();
        setAccountForm({ bankName: '', accountNumber: '', currency: 'DOP', type: 'corriente', color: '#003366', initialBalance: '' });
      } else {
        toast.error(data.error?.message || 'Error al crear cuenta');
      }
    } catch (error) {
      toast.error('Error de red al crear cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/bank/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedAccount.id,
          date: txForm.date,
          type: txForm.type,
          amount: parseFloat(txForm.amount) || 0,
          reference: txForm.reference,
          description: txForm.description,
          contraAccountId: txForm.contraAccountId || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Transacción registrada exitosamente');
        setShowTxModal(false);
        fetchAccounts(); // Update balances
        fetchTransactions(selectedAccount.id);
        setTxForm({ date: new Date().toISOString().split('T')[0], type: 'deposit', amount: '', reference: '', description: '', contraAccountId: '' });
      } else {
        toast.error(data.error?.message || 'Error al registrar transacción');
      }
    } catch (error) {
      toast.error('Error de red al procesar transacción');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintTransactions = async () => {
    if (!selectedAccount) return;
    const toastId = toast.loading('Preparando reporte de transacciones...');
    try {
      const [settingsRes] = await Promise.all([
        fetch('/api/v1/company/settings')
      ]);
      const settingsData = await settingsRes.json();
      const company = settingsData.data || {};
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas emergentes.', { id: toastId });
        return;
      }

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Empresa'}</div>`;

      // Filter local items based on search if applied
      const itemsToPrint = transactions.filter(tx => {
        if (!bankSearch.trim()) return true;
        return (tx.description || '').toLowerCase().includes(bankSearch.toLowerCase()) ||
          (tx.reference || '').toLowerCase().includes(bankSearch.toLowerCase());
      });

      const htmlContent = `
        <html>
          <head>
            <title>Reporte de Transacciones Bancarias - ${company.companyName || 'Empresa'}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 30px; line-height: 1.4; font-size: 13px; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 20px; }
              .company-info { font-size: 12px; color: #555; line-height: 1.4; }
              .doc-info { text-align: right; }
              .subtitle { font-size: 16pt; color: #003366; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 9px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8f9fa; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; font-size: 12px; }
              .footer { margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
              .text-emerald { color: #10b981; font-weight: bold; }
              .text-rose { color: #f43f5e; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-info">
                ${logoHtml}
                ${companyTitleHtml}
                ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
                ${company.address ? `<div>${company.address}</div>` : ''}
              </div>
              <div class="doc-info">
                <div class="subtitle">HISTORIAL DE TRANSACCIONES</div>
                <div><strong>Cuenta:</strong> ${selectedAccount.bankName} ${selectedAccount.currency !== '-' ? `(${selectedAccount.currency})` : ''}</div>
                <div><strong>Rango:</strong> ${startDate || 'Inicio'} - ${endDate || 'Fin'}</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Referencia</th>
                  <th>Tipo</th>
                  <th class="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${itemsToPrint.length === 0 ? '<tr><td colSpan="5" class="text-center">No hay transacciones para este reporte.</td></tr>' : ''}
                ${itemsToPrint.map(tx => {
                  const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
                  return `
                    <tr>
                      <td>${new Date(tx.date).toLocaleDateString('es-DO')}</td>
                      <td><strong>${tx.description || 'Movimiento Bancario'}</strong></td>
                      <td class="font-mono">${tx.reference || '-'}</td>
                      <td>${tx.type.toUpperCase()}</td>
                      <td class="text-right font-mono ${isIncoming ? 'text-emerald' : 'text-rose'}">
                        ${isIncoming ? '+' : '-'}${fmt(tx.amount)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="footer">
              Historial Bancario - Generado por ContFast Enterprise
            </div>
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.dismiss(toastId);
    } catch (error) {
      toast.error('Error al generar el reporte', { id: toastId });
    }
  };

  const allBanksAccount = {
    id: 'all',
    bankName: 'Todas las Cuentas',
    accountNumber: '-',
    currency: '-',
    type: 'todas',
    balance: '0.00',
    status: 'active',
    color: '#0f172a'
  };

  const displayAccounts = [allBanksAccount, ...accounts];

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Landmark className="h-3 w-3" /> Cuentas Bancarias
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Cuentas Bancarias
            </h1>
            <p className="text-slate-500/70 text-sm mt-1">
              Consulta de saldos y registro de movimientos bancarios.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowNewAccountModal(true)} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
              <Plus className="h-4 w-4" /> Nueva Cuenta
            </button>
            <button disabled={!selectedAccount} onClick={() => setShowTxModal(true)} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
              <ArrowRightLeft className="h-4 w-4" /> Registrar Movimiento
            </button>
          </div>
        </div>

        {/* Accounts Grid */}
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-sm">
            <Landmark className="h-16 w-16 text-slate-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#003366]">Sin Cuentas Bancarias</h3>
            <p className="text-slate-500/70 mt-2">No hay cuentas bancarias registradas en la empresa.</p>
            <button onClick={() => setShowNewAccountModal(true)} className="mt-6 text-[#C5A059] font-bold hover:underline">Crear mi primera cuenta</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayAccounts.map(acc => (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  style={{
                    backgroundColor: acc.color || '#003366',
                    borderColor: selectedAccount?.id === acc.id ? '#C5A059' : 'transparent',
                  }}
                  className={clsx("cursor-pointer rounded-2xl p-6 transition border-2 text-white shadow-md relative overflow-hidden", selectedAccount?.id === acc.id ? 'transform scale-[1.02] shadow-xl ring-2 ring-[#C5A059]/50' : 'hover:shadow-lg opacity-95 hover:opacity-100')}
                >
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/10">
                        {acc.id === 'all' ? <Landmark className="h-5 w-5 text-white" /> : <Building2 className="h-5 w-5 text-white" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg leading-tight tracking-wide">{acc.bankName}</h3>
                        <p className="text-sm font-mono tracking-widest text-white/80 mt-1">{acc.id === 'all' ? 'Vista Global' : maskAccount(acc.accountNumber)}</p>
                      </div>
                    </div>
                  </div>
                  {acc.id !== 'all' && (
                    <div className="mt-8 relative z-10">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-white/60 mb-1">Balance Actual</p>
                      <p className="text-2xl font-mono font-bold">
                        {fmt(acc.balance, acc.currency)} <span className="text-sm font-sans font-normal opacity-80">{acc.currency}</span>
                      </p>
                    </div>
                  )}
                  {acc.id === 'all' && (
                    <div className="mt-8 relative z-10">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-white/60 mb-1">Seleccionar</p>
                      <p className="text-sm font-bold opacity-90 mt-1">
                        Ver todas las transacciones combinadas
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Transactions Table Section */}
            {!selectedAccount ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center shadow-sm mt-6 flex flex-col items-center">
                <Info className="h-10 w-10 text-amber-500 mb-3" />
                <h3 className="text-lg font-bold text-amber-800">Seleccione una cuenta bancaria</h3>
                <p className="text-amber-700/80 text-sm mt-1 max-w-md">Para visualizar el historial de transacciones, haga clic en una de las cuentas arriba o seleccione la opción "Todas las Cuentas".</p>
              </div>
            ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
              {/* Table Header + Filters */}
              <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">Historial de Transacciones {loadingTxs && <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />}</h3>
                    <p className="text-xs font-semibold text-slate-500/70 uppercase tracking-wider">{selectedAccount.bankName} {selectedAccount.currency !== '-' ? `(${selectedAccount.currency})` : ''}</p>
                  </div>
                  <button
                    onClick={handlePrintTransactions}
                    className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 px-4 py-2 h-9 rounded-lg font-bold shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir Reporte
                  </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-end gap-3">
                  {/* Bank Search */}
                  <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Buscar</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={bankSearch}
                        onChange={e => setBankSearch(e.target.value)}
                        placeholder="Descripción o referencia..."
                        className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Date Range Picker */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rango de Fechas</label>
                    <div className="w-64">
                      <DateRangePicker
                        from={startDate}
                        to={endDate}
                        onChange={({ from, to }) => {
                          setStartDate(from);
                          setEndDate(to);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <>
                {/* Mobile View */}
                <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
                  {(() => {
                    const filtered = transactions.filter(tx => {
                      if (!bankSearch.trim()) return true;
                      return (tx.description || '').toLowerCase().includes(bankSearch.toLowerCase()) ||
                        (tx.reference || '').toLowerCase().includes(bankSearch.toLowerCase());
                    });
                    if (filtered.length === 0) return (
                      <div className="py-12 text-center">
                        <p className="text-xs text-slate-500/70">
                          {transactions.length === 0 ? 'No hay movimientos en este rango de fechas.' : 'Ningún movimiento coincide con la búsqueda.'}
                        </p>
                      </div>
                    );
                    return filtered.map(tx => {
                      const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
                      return (
                        <div key={tx.id} className="flex flex-col p-4 hover:bg-slate-50/50 transition-colors gap-2">
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-slate-500/80 font-medium">{new Date(tx.date).toLocaleDateString('es-DO')}</span>
                            <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase", isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                              {isIncoming ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              {tx.type}
                            </span>
                          </div>
                          
                          <div className="flex flex-col mt-1">
                            <span className="text-sm font-semibold text-[#003366]">{tx.description || 'Movimiento Bancario'}</span>
                            <span className="text-[10px] font-mono text-slate-500/70 mt-0.5">Ref: {tx.reference || '-'}</span>
                          </div>
                          
                          <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-50">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monto</span>
                            <span className={clsx("text-sm font-mono font-bold", isIncoming ? 'text-emerald-600' : 'text-slate-800')}>
                              {isIncoming ? '+' : '-'}{fmt(tx.amount)}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white border-b border-slate-200 text-[10px] tracking-widest text-slate-500 uppercase font-bold">
                      <tr>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Referencia</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(() => {
                        const filtered = transactions.filter(tx => {
                          if (!bankSearch.trim()) return true;
                          return (tx.description || '').toLowerCase().includes(bankSearch.toLowerCase()) ||
                            (tx.reference || '').toLowerCase().includes(bankSearch.toLowerCase());
                        });
                        if (filtered.length === 0) return (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-slate-500/70">
                              {transactions.length === 0 ? 'No hay movimientos en este rango de fechas.' : 'Ningún movimiento coincide con la búsqueda.'}
                            </td>
                          </tr>
                        );
                        return filtered.map(tx => {
                          const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2.5 text-xs text-slate-500/80 font-medium">{new Date(tx.date).toLocaleDateString('es-DO')}</td>
                              <td className="px-4 py-2.5 text-xs font-semibold text-[#003366]">{tx.description || 'Movimiento Bancario'}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-slate-500/70">{tx.reference || '-'}</td>
                              <td className="px-4 py-2.5 text-xs">
                                <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase", isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                                  {isIncoming ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                  {tx.type}
                                </span>
                              </td>
                              <td className={clsx("px-4 py-2.5 text-xs text-right font-mono font-bold", isIncoming ? 'text-emerald-600' : 'text-slate-800')}>
                                {isIncoming ? '+' : '-'}{fmt(tx.amount)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            </div>
            )}
          </>
        )}

      </div>

      {/* MODAL: NEW ACCOUNT */}
      <AnimatePresence>
        {showNewAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2"><Landmark className="w-5 h-5 text-[#c5a059]" /> Nueva Cuenta Bancaria</h3>
                <button type="button" onClick={() => setShowNewAccountModal(false)} className="text-slate-500 hover:text-slate-800 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateAccount} className="p-4 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nombre del Banco</label>
                  <input type="text" required value={accountForm.bankName} onChange={e => setAccountForm({ ...accountForm, bankName: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors" placeholder="Ej. Banco Popular" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Número de Cuenta</label>
                  <input type="text" required value={accountForm.accountNumber} onChange={e => setAccountForm({ ...accountForm, accountNumber: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono" placeholder="Ej. 1234567890" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Moneda</label>
                    <select value={accountForm.currency} onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors">
                      <option value="DOP">DOP (Pesos)</option>
                      <option value="USD">USD (Dólares)</option>
                      <option value="EUR">EUR (Euros)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tipo</label>
                    <select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors">
                      <option value="corriente">Corriente</option>
                      <option value="ahorros">Ahorros</option>
                    </select>
                  </div>
                </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Color de Tarjeta</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={accountForm.color} onChange={e => setAccountForm({ ...accountForm, color: e.target.value })} className="h-8 w-14 p-1 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer" />
                      <span className="text-xs text-slate-500 font-mono">{accountForm.color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Balance Inicial</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                      <input type="number" min="0" step="0.01" required value={accountForm.initialBalance} onChange={e => setAccountForm({ ...accountForm, initialBalance: e.target.value })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono" placeholder="0.00" />
                    </div>
                  </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowNewAccountModal(false)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: REGISTER TX */}
      <AnimatePresence>
        {showTxModal && selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-[#c5a059]" /> Registrar Movimiento</h3>
                <button type="button" onClick={() => setShowTxModal(false)} className="text-slate-500 hover:text-slate-800 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleRegisterTx} className="p-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cuenta Seleccionada</p>
                    <p className="font-bold text-slate-800">{selectedAccount.bankName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Balance Actual</p>
                    <p className="font-mono font-bold text-slate-800">{fmt(selectedAccount.balance, selectedAccount.currency)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Fecha</label>
                    <input type="date" required value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tipo de Movimiento</label>
                    <select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors">
                      <option value="deposit">Ingreso (Depósito)</option>
                      <option value="transfer_in">Ingreso (Transferencia)</option>
                      <option value="withdrawal">Egreso (Retiro)</option>
                      <option value="transfer_out">Egreso (Transferencia)</option>
                      <option value="fee">Egreso (Cargo/Comisión)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Monto</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                    <input type="number" min="0.01" step="0.01" required value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono font-bold" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cuenta Contable (Contrapartida)</label>
                  <select required value={txForm.contraAccountId} onChange={e => setTxForm({ ...txForm, contraAccountId: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors">
                    <option value="">Seleccione cuenta (Ej. Ingresos / Gastos)</option>
                    {chartOfAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Descripción</label>
                    <input type="text" required value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors" placeholder="Ej. Depósito ventas del día" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Referencia (Opcional)</label>
                    <input type="text" value={txForm.reference} onChange={e => setTxForm({ ...txForm, reference: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono" placeholder="Ej. TX-58493" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowTxModal(false)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Procesar Movimiento
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
