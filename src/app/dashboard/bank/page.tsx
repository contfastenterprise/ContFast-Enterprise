'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Landmark, Plus, ArrowRightLeft, RefreshCw, X, CreditCard, Building2, CheckCircle2, ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';
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
  }, [selectedAccount]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/bank/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
        if (data.data.length > 0 && !selectedAccount) {
          setSelectedAccount(data.data[0]);
        }
      }
    } catch (err) {
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (accountId: string) => {
    setLoadingTxs(true);
    try {
      const res = await fetch(`/api/v1/bank/transactions?accountId=${accountId}`);
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

  const fetchChartOfAccounts = async () => {
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
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Consulta de saldos y registro de movimientos bancarios.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowNewAccountModal(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-[#003366] px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nueva Cuenta
            </button>
            <button disabled={!selectedAccount} onClick={() => setShowTxModal(true)} className="bg-[#C5A059] hover:bg-[#b08c4a] disabled:opacity-50 text-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Registrar Movimiento
            </button>
          </div>
        </div>

        {/* Accounts Grid */}
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-sm">
            <Landmark className="h-16 w-16 text-on-surface-variant mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#003366]">Sin Cuentas Bancarias</h3>
            <p className="text-on-surface-variant/70 mt-2">No hay cuentas bancarias registradas en la empresa.</p>
            <button onClick={() => setShowNewAccountModal(true)} className="mt-6 text-[#C5A059] font-bold hover:underline">Crear mi primera cuenta</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  style={{
                    backgroundColor: acc.color || '#003366',
                    borderColor: selectedAccount?.id === acc.id ? '#C5A059' : 'transparent',
                  }}
                  className={clsx("cursor-pointer rounded-2xl p-6 transition-all border-2 text-white shadow-md relative overflow-hidden", selectedAccount?.id === acc.id ? 'transform scale-[1.02] shadow-xl ring-2 ring-[#C5A059]/50' : 'hover:shadow-lg opacity-95 hover:opacity-100')}
                >
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/10">
                        <Building2 className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg leading-tight tracking-wide">{acc.bankName}</h3>
                        <p className="text-sm font-mono tracking-widest text-white/80 mt-1">{maskAccount(acc.accountNumber)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 relative z-10">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-white/60 mb-1">Balance Actual</p>
                    <p className="text-2xl font-mono font-bold">
                      {fmt(acc.balance, acc.currency)} <span className="text-sm font-sans font-normal opacity-80">{acc.currency}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
              <div className="bg-slate-50 border-b border-slate-200 p-5 flex flex-wrap justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Historial de Transacciones</h3>
                  <p className="text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">{selectedAccount?.bankName} ({selectedAccount?.currency})</p>
                </div>
                {loadingTxs && <RefreshCw className="h-4 w-4 animate-spin text-on-surface-variant" />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white border-b border-slate-100 text-[10px] tracking-widest text-on-surface-variant uppercase font-bold">
                    <tr>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Descripción</th>
                      <th className="px-6 py-4">Referencia</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant/70">No hay movimientos registrados en esta cuenta.</td>
                      </tr>
                    ) : (
                      transactions.map(tx => {
                        const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 text-on-surface-variant/80 font-medium">{new Date(tx.date).toLocaleDateString('es-DO')}</td>
                            <td className="px-6 py-3 font-semibold text-[#003366]">{tx.description || 'Movimiento Bancario'}</td>
                            <td className="px-6 py-3 font-mono text-xs text-on-surface-variant/70">{tx.reference || '-'}</td>
                            <td className="px-6 py-3">
                              <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase", isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                                {isIncoming ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                {tx.type}
                              </span>
                            </td>
                            <td className={clsx("px-6 py-3 text-right font-mono font-bold", isIncoming ? 'text-emerald-600' : 'text-slate-800')}>
                              {isIncoming ? '+' : '-'}{fmt(tx.amount)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>

      {/* MODAL: NEW ACCOUNT */}
      <AnimatePresence>
        {showNewAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><Landmark className="w-5 h-5 text-[#c5a059]" /> Nueva Cuenta Bancaria</h3>
                <button onClick={() => setShowNewAccountModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateAccount} className="p-6 space-y-5">
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Nombre del Banco</label>
                  <input type="text" required value={accountForm.bankName} onChange={e => setAccountForm({ ...accountForm, bankName: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. Banco Popular" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Número de Cuenta</label>
                  <input type="text" required value={accountForm.accountNumber} onChange={e => setAccountForm({ ...accountForm, accountNumber: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. 1234567890" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Moneda</label>
                    <select value={accountForm.currency} onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors">
                      <option value="DOP">DOP (Pesos)</option>
                      <option value="USD">USD (Dólares)</option>
                      <option value="EUR">EUR (Euros)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Tipo</label>
                    <select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors">
                      <option value="corriente">Corriente</option>
                      <option value="ahorros">Ahorros</option>
                    </select>
                  </div>
                </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5">Color de Tarjeta</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={accountForm.color} onChange={e => setAccountForm({ ...accountForm, color: e.target.value })} className="h-10 w-14 p-1 rounded bg-surface-container-highest border border-outline cursor-pointer" />
                      <span className="text-sm text-on-surface-variant font-mono">{accountForm.color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-widest mb-1.5">Balance Inicial</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                      <input type="number" min="0" step="0.01" required value={accountForm.initialBalance} onChange={e => setAccountForm({ ...accountForm, initialBalance: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg pl-8 pr-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="0.00" />
                    </div>
                  </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowNewAccountModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-[#c5a059]" /> Registrar Movimiento</h3>
                <button onClick={() => setShowTxModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleRegisterTx} className="p-6 space-y-5">
                <div className="bg-[#001733] p-4 rounded-xl border border-[#003366] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-[#c5a059] uppercase tracking-widest">Cuenta Seleccionada</p>
                    <p className="font-bold text-white">{selectedAccount.bankName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-[#c5a059] uppercase tracking-widest">Balance Actual</p>
                    <p className="font-mono font-bold text-white">{fmt(selectedAccount.balance, selectedAccount.currency)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Fecha</label>
                    <input type="date" required value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Tipo de Movimiento</label>
                    <select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors">
                      <option value="deposit">Ingreso (Depósito)</option>
                      <option value="transfer_in">Ingreso (Transferencia)</option>
                      <option value="withdrawal">Egreso (Retiro)</option>
                      <option value="transfer_out">Egreso (Transferencia)</option>
                      <option value="fee">Egreso (Cargo/Comisión)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Monto</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                    <input type="number" min="0.01" step="0.01" required value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg pl-8 pr-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono font-bold" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Cuenta Contable (Contrapartida)</label>
                  <select required value={txForm.contraAccountId} onChange={e => setTxForm({ ...txForm, contraAccountId: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors">
                    <option value="">Seleccione cuenta (Ej. Ingresos / Gastos)</option>
                    {chartOfAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-semibold text-primary block mb-1">Descripción</label>
                    <input type="text" required value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. Depósito ventas del día" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-semibold text-primary block mb-1">Referencia (Opcional)</label>
                    <input type="text" value={txForm.reference} onChange={e => setTxForm({ ...txForm, reference: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. TX-58493" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowTxModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
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
