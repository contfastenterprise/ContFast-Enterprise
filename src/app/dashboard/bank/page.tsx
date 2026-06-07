'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Landmark, Plus, ArrowUpRight, ArrowDownRight, Check, AlertTriangle, RefreshCw, X, Receipt, Calculator, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function BankDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);

  // Modals state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showReconModal, setShowReconModal] = useState(false);

  // Forms state
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState('DOP');
  const [accountType, setAccountType] = useState('corriente');
  const [initialBalance, setInitialBalance] = useState('');

  const [txType, setTxType] = useState('deposit');
  const [txAmount, setTxAmount] = useState('');
  const [txReference, setTxReference] = useState('');
  const [txDescription, setTxDescription] = useState('');

  const [reconStartDate, setReconStartDate] = useState('');
  const [reconEndDate, setReconEndDate] = useState('');
  const [reconClosingBalance, setReconClosingBalance] = useState('');

  // Initial Load
  const loadBankData = async () => {
    try {
      const accRes = await fetch('/api/v1/bank/accounts');
      const accData = await accRes.json();
      if (accData.success) {
        setAccounts(accData.data || []);
        if (accData.data?.length > 0 && !selectedAccount) {
          setSelectedAccount(accData.data[0]);
        }
      }

      const reconRes = await fetch('/api/v1/bank/reconciliations');
      const reconData = await reconRes.json();
      if (reconData.success) {
        setReconciliations(reconData.data || []);
      }
    } catch (error) {
      console.error('Failed to load banking data:', error);
      toast.error('Error al cargar datos bancarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBankData();
  }, []);

  // Load transactions when account changes
  useEffect(() => {
    if (!selectedAccount) return;
    async function loadTransactions() {
      try {
        const res = await fetch(`/api/v1/bank/accounts/${selectedAccount.id}/transactions`);
        const data = await res.json();
        if (data.success) {
          setTransactions(data.data || []);
        }
      } catch (error) {
        console.error('Failed to load transactions:', error);
      }
    }
    loadTransactions();
  }, [selectedAccount]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber || !initialBalance) {
      toast.error('Complete todos los campos obligatorios');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/bank/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName,
          accountNumber,
          currency,
          type: accountType,
          balance: parseFloat(initialBalance),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al crear la cuenta bancaria');
      }

      toast.success('Cuenta bancaria vinculada exitosamente');
      setShowAccountModal(false);
      setBankName('');
      setAccountNumber('');
      setInitialBalance('');
      loadBankData();
    } catch (error: any) {
      toast.error('Error de vinculación', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || !txDescription) {
      toast.error('Complete todos los campos obligatorios');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch(`/api/v1/bank/accounts/${selectedAccount.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: txType,
          amount: parseFloat(txAmount),
          reference: txReference || undefined,
          description: txDescription,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al registrar la transacción');
      }

      toast.success('Transacción bancaria registrada exitosamente');
      setShowTxModal(false);
      setTxAmount('');
      setTxReference('');
      setTxDescription('');
      
      // Refresh current account balance and transaction list
      loadBankData();
      const txRes = await fetch(`/api/v1/bank/accounts/${selectedAccount.id}/transactions`);
      const txData = await txRes.json();
      if (txData.success) {
        setTransactions(txData.data || []);
      }
    } catch (error: any) {
      toast.error('Error de registro', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconStartDate || !reconEndDate || !reconClosingBalance) {
      toast.error('Complete todos los campos obligatorios');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/bank/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedAccount.id,
          startDate: reconStartDate,
          endDate: reconEndDate,
          closingBalance: parseFloat(reconClosingBalance),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al procesar la conciliación');
      }

      toast.success('Periodo de conciliación publicado correctamente');
      setShowReconModal(false);
      setReconStartDate('');
      setReconEndDate('');
      setReconClosingBalance('');
      loadBankData();
    } catch (error: any) {
      toast.error('Fallo en conciliación', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-slate-400 text-sm">Cargando cuentas e integraciones bancarias...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
              <Landmark className="h-7 w-7 text-amber-500" />
              Cuentas e Integración Bancaria
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administre cuentas bancarias comerciales, registre movimientos y ejecute conciliaciones periódicas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowAccountModal(true)}
              className="flex items-center gap-2 rounded-md bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-350 hover:bg-slate-850 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Vincular Cuenta
            </button>
            {selectedAccount && (
              <>
                <button
                  onClick={() => setShowReconModal(true)}
                  className="flex items-center gap-2 rounded-md bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-350 hover:bg-slate-850 transition-colors"
                >
                  <Calculator className="h-4 w-4 text-emerald-500" />
                  Conciliar Periodo
                </button>
                <button
                  onClick={() => setShowTxModal(true)}
                  className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
                >
                  <Plus className="h-4 w-4" />
                  Registrar Movimiento
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bank Accounts Grid */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Nodos de Cuentas Vinculadas</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {accounts.map((acc) => {
              const active = selectedAccount?.id === acc.id;
              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className={`cursor-pointer bg-slate-900/60 backdrop-blur-xl p-6 rounded-lg border transition-all duration-300 relative overflow-hidden group flex flex-col justify-between h-44 shadow-lg ${
                    active
                      ? 'border-amber-500/55 bg-amber-500/[0.02] shadow-[0_0_20px_rgba(245,158,11,0.05)]'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">{acc.type}</p>
                      <h4 className="text-base font-bold text-white mt-0.5">{acc.bankName}</h4>
                    </div>
                    <Landmark className={`h-6 w-6 ${active ? 'text-amber-500' : 'text-slate-500'}`} />
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Balance disponible</p>
                    <p className="text-2xl font-bold text-white tracking-tight mt-0.5">
                      {acc.currency} $ {parseFloat(acc.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">Num: {acc.accountNumber}</p>
                  </div>
                </div>
              );
            })}
            {accounts.length === 0 && (
              <div className="col-span-1 md:col-span-3 rounded-lg border border-dashed border-slate-800 p-12 text-center text-slate-500 text-sm">
                No hay cuentas bancarias vinculadas todavía. Vincule una para comenzar.
              </div>
            )}
          </div>
        </section>

        {/* Selected Account Ledger & Reconciliations */}
        {selectedAccount && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Transactions Ledger */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-lg space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Historial de Transacciones</h3>
                <span className="text-xs text-slate-500 font-mono">
                  {selectedAccount.bankName} ({selectedAccount.accountNumber})
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-350">
                  <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Concepto / Referencia</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-855">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-950/20 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                          {new Date(tx.date).toLocaleDateString('es-DO')}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white text-xs">{tx.description}</p>
                          {tx.reference && <span className="text-[10px] text-slate-500 font-mono">Ref: {tx.reference}</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              tx.status === 'reconciled'
                                ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-semibold text-xs ${
                          ['deposit', 'transfer_in'].includes(tx.type) ? 'text-emerald-500' : 'text-white'
                        }`}>
                          {['deposit', 'transfer_in'].includes(tx.type) ? '+' : '-'} {selectedAccount.currency} $ {parseFloat(tx.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          Ningún movimiento registrado para esta cuenta.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reconciliation History */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-lg space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Conciliaciones Cerradas</h3>
              </div>
              <div className="space-y-4">
                {reconciliations
                  .filter((r) => r.bankAccountId === selectedAccount.id)
                  .map((recon) => (
                    <div
                      key={recon.id}
                      className="p-4 rounded-lg bg-slate-950 border border-slate-850 hover:border-emerald-500/20 transition-colors space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Periodo de Conciliación</span>
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20 uppercase">
                          {recon.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {new Date(recon.startDate).toLocaleDateString('es-DO')} al {new Date(recon.endDate).toLocaleDateString('es-DO')}
                        </span>
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between">
                        <span>Balance al Cierre:</span>
                        <span className="font-semibold text-white">
                          RD$ {parseFloat(recon.closingBalance).toLocaleString('es-DO')}
                        </span>
                      </div>
                    </div>
                  ))}
                {reconciliations.filter((r) => r.bankAccountId === selectedAccount.id).length === 0 && (
                  <p className="text-slate-500 text-center text-xs py-4">No hay periodos de conciliación cerrados para esta cuenta.</p>
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* MODAL: Link Bank Account */}
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAccountModal(false)}
              className="fixed inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl z-10 text-slate-350 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Vincular Cuenta Bancaria</h3>
                <button onClick={() => setShowAccountModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="block text-xs font-semibold text-slate-350 uppercase">Nombre de Institución Bancaria</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Banco Popular Dominicano"
                      required
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block text-xs font-semibold text-slate-355 uppercase">Número de Cuenta</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="728495034"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-355 uppercase">Moneda</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    >
                      <option value="DOP">DOP (Pesos)</option>
                      <option value="USD">USD (Dólares)</option>
                      <option value="EUR">EUR (Euros)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-355 uppercase">Tipo Cuenta</label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    >
                      <option value="corriente">Corriente</option>
                      <option value="ahorros">Ahorros</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block text-xs font-semibold text-slate-355 uppercase">Saldo Inicial de Apertura</label>
                    <input
                      type="number"
                      value={initialBalance}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="0.00"
                      min={0}
                      step="any"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(false)}
                    className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    {submitting ? 'Creando cuenta...' : 'Vincular Cuenta'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Register Account Transaction */}
      <AnimatePresence>
        {showTxModal && selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTxModal(false)}
              className="fixed inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl z-10 text-slate-300 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Registrar Transacción</h3>
                <button onClick={() => setShowTxModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold uppercase">Tipo de Movimiento</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  >
                    <option value="deposit">Depósito / Entrada</option>
                    <option value="withdrawal">Retiro / Salida</option>
                    <option value="fee">Comisión Bancaria</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold uppercase">Monto ({selectedAccount.currency})</label>
                  <input
                    type="number"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    placeholder="0.00"
                    min={0.01}
                    step="any"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold uppercase">Número de Referencia</label>
                  <input
                    type="text"
                    value={txReference}
                    onChange={(e) => setTxReference(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    placeholder="CK-101 (Opcional)"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold uppercase">Concepto / Descripción</label>
                  <textarea
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm h-16 resize-none"
                    placeholder="Describa el motivo de la transacción..."
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowTxModal(false)}
                    className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Registrar Movimiento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Conciliar Periodo */}
      <AnimatePresence>
        {showReconModal && selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReconModal(false)}
              className="fixed inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl z-10 text-slate-300 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider flex items-center gap-1">
                  <Calculator className="h-5 w-5 text-emerald-500" />
                  Conciliar Periodo
                </h3>
                <button onClick={() => setShowReconModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReconciliation} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Fecha Inicio</label>
                    <input
                      type="date"
                      value={reconStartDate}
                      onChange={(e) => setReconStartDate(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Fecha Cierre</label>
                    <input
                      type="date"
                      value={reconEndDate}
                      onChange={(e) => setReconEndDate(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block text-slate-300 font-semibold uppercase">Balance al Cierre en Banco</label>
                    <input
                      type="number"
                      value={reconClosingBalance}
                      onChange={(e) => setReconClosingBalance(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Balance final de extracto bancario..."
                      step="any"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowReconModal(false)}
                    className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Conciliar Periodo
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardLayout>
  );
}
