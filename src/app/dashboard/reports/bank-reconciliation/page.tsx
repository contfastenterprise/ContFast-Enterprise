'use client';

import { useState, useEffect } from 'react';
import { Landmark, ArrowLeft, Calendar, FileText, ChevronRight, CheckCircle2, AlertTriangle, HelpCircle, Loader2, Save, History, DollarSign } from 'lucide-react';
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
  status: string; // pending | reconciled
}

interface ReconciliationHistory {
  id: string;
  startDate: string;
  endDate: string;
  openingBalance: string;
  closingBalance: string;
  status: string;
  createdAt: string;
}

const fmt = (val: string | number, currency = 'DOP') => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency }).format(Number(val) || 0);
};

const maskAccount = (acc: string) => {
  if (!acc || acc.length < 4) return acc;
  return `****${acc.slice(-4)}`;
};

export default function BankReconciliationPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  
  // Parameters
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
  );
  const [bankStatementBalance, setBankStatementBalance] = useState<string>('0');
  
  // Data
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationHistory[]>([]);
  const [clearedTxIds, setClearedTxIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchData(selectedAccount.id);
    }
  }, [selectedAccount, startDate, endDate]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/bank/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
        if (data.data.length > 0) {
          setSelectedAccount(data.data[0]);
        }
      }
    } catch (err) {
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (accountId: string) => {
    setLoading(true);
    try {
      // Get all bank transactions
      const txRes = await fetch(`/api/v1/bank/transactions?accountId=${accountId}`);
      const txData = await txRes.json();
      
      // Get history of reconciliations
      const reconRes = await fetch(`/api/v1/bank/reconciliations?bank_account_id=${accountId}`);
      const reconData = await reconRes.json();

      if (txData.success) {
        setTransactions(txData.data || []);
        
        // Auto-select transactions that are already reconciled or let user choose.
        // We initialize the cleared list with transactions that are reconciled in the database.
        const initialCleared = new Set<string>();
        txData.data.forEach((tx: BankTransaction) => {
          if (tx.status === 'reconciled') {
            initialCleared.add(tx.id);
          }
        });
        setClearedTxIds(initialCleared);
      }
      
      if (reconData.success) {
        setReconciliations(reconData.data || []);
      }
    } catch (err) {
      toast.error('Error al cargar transacciones y conciliaciones');
    } finally {
      setLoading(false);
    }
  };

  // Math for reconciliation
  // 1. Book balance at the end date (Saldo en libros a la fecha de corte)
  const currentAccountBalance = selectedAccount ? parseFloat(selectedAccount.balance) : 0;
  
  // Calculate book balance as of the end date
  const getBookBalanceAtCutoff = () => {
    let balance = currentAccountBalance;
    // For transactions strictly after endDate, we reverse their effect on the current balance
    transactions.forEach(tx => {
      if (tx.date > endDate) {
        const amount = parseFloat(tx.amount);
        const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
        if (isIncoming) {
          balance -= amount; // Subtract deposits that happened after end date
        } else {
          balance += amount; // Add withdrawals that happened after end date
        }
      }
    });
    return balance;
  };

  const bookBalanceAtCutoff = getBookBalanceAtCutoff();

  // Transactions inside the selected range
  const periodTransactions = transactions.filter(tx => tx.date >= startDate && tx.date <= endDate);

  // In transit deposits: transactions within range of incoming type that are NOT checked (cleared)
  const depositsInTransit = periodTransactions.filter(tx => 
    ['deposit', 'transfer_in'].includes(tx.type) && !clearedTxIds.has(tx.id)
  );
  const totalDepositsInTransit = depositsInTransit.reduce((acc, tx) => acc + parseFloat(tx.amount), 0);

  // Outstanding checks/payments: transactions within range of outgoing type that are NOT checked (cleared)
  const outstandingChecks = periodTransactions.filter(tx => 
    ['withdrawal', 'transfer_out', 'fee'].includes(tx.type) && !clearedTxIds.has(tx.id)
  );
  const totalOutstandingChecks = outstandingChecks.reduce((acc, tx) => acc + parseFloat(tx.amount), 0);

  // Adjusted bank statement balance
  const parsedBankStatementBalance = parseFloat(bankStatementBalance) || 0;
  const adjustedBankBalance = parsedBankStatementBalance + totalDepositsInTransit - totalOutstandingChecks;

  // Adjusted book balance (we can add adjustments if they add new ledger adjustments, currently we assume books are primary)
  const adjustedBookBalance = bookBalanceAtCutoff;

  // The reconciliation discrepancy
  const difference = adjustedBankBalance - adjustedBookBalance;
  const isReconciled = Math.abs(difference) < 0.01;

  // Handle toggling cleared status
  const handleToggleCleared = (txId: string) => {
    const next = new Set(clearedTxIds);
    if (next.has(txId)) {
      next.delete(txId);
    } else {
      next.add(txId);
    }
    setClearedTxIds(next);
  };

  // Submit reconciliation record
  const handlePostReconciliation = async () => {
    if (!selectedAccount) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/bank/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedAccount.id,
          startDate,
          endDate,
          openingBalance: parsedBankStatementBalance - totalDepositsInTransit + totalOutstandingChecks, // historical opening
          closingBalance: parsedBankStatementBalance,
          status: 'posted' // we post it
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Conciliación bancaria guardada y publicada exitosamente.');
        fetchData(selectedAccount.id);
      } else {
        toast.error(data.error?.message || 'Error al procesar conciliación');
      }
    } catch (err) {
      toast.error('Error de red al procesar conciliación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      {/* Header Info Bar */}
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-between items-center shadow-inner">
        <a href="/dashboard/reports" className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Volver a Reportes
        </a>
        <span className="text-primary text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Landmark className="h-3 w-3" /> Reportes Financieros
        </span>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
            <Landmark className="h-8 w-8 text-[#C5A059]" />
            Conciliación Bancaria
          </h1>
          <p className="text-on-surface-variant/70 text-sm mt-1">
            Compara y ajusta los saldos de tus estados bancarios frente a tu contabilidad interna.
          </p>
        </div>

        {/* Configurations & Inputs */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cuenta Bancaria</label>
            <select
              value={selectedAccount?.id || ''}
              onChange={e => {
                const acc = accounts.find(a => a.id === e.target.value);
                if (acc) setSelectedAccount(acc);
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm font-semibold"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.bankName} - {maskAccount(acc.accountNumber)} ({acc.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Fecha Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Fecha Corte (Hasta)</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> Saldo Final Estado Banco
            </label>
            <input
              type="number"
              step="0.01"
              value={bankStatementBalance}
              onChange={e => setBankStatementBalance(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm font-mono font-bold"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Main Loading state */}
        {loading ? (
          <div className="flex flex-col justify-center items-center py-20 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[#C5A059]" />
            <p className="text-sm font-semibold text-slate-500 animate-pulse">Obteniendo registros contables...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Reconciliation Board Formulas */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Dual Column Equation Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#003366]" /> Cuadro de Conciliación Aritmética
                  </h3>
                  {isReconciled ? (
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 animate-bounce">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Conciliado (Diferencia: 0.00)
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Descuadre: {fmt(difference, selectedAccount?.currency)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 p-6 gap-6 md:gap-0">
                  {/* Left Column: Bank statement reconciliation */}
                  <div className="space-y-4 pr-0 md:pr-6">
                    <h4 className="font-bold text-[#003366] text-xs uppercase tracking-widest border-b border-slate-100 pb-2">Sección 1: Banco</h4>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Saldo según Estado de Banco:</span>
                      <span className="font-mono font-bold text-slate-800">{fmt(parsedBankStatementBalance, selectedAccount?.currency)}</span>
                    </div>

                    <div className="flex justify-between text-sm text-emerald-600">
                      <span className="flex items-center gap-1">(+) Depósitos en Tránsito ({depositsInTransit.length}):</span>
                      <span className="font-mono font-semibold">+{fmt(totalDepositsInTransit, selectedAccount?.currency)}</span>
                    </div>

                    <div className="flex justify-between text-sm text-rose-600">
                      <span className="flex items-center gap-1">(-) Cheques / Pagos en Tránsito ({outstandingChecks.length}):</span>
                      <span className="font-mono font-semibold">-{fmt(totalOutstandingChecks, selectedAccount?.currency)}</span>
                    </div>

                    <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between font-bold text-slate-950">
                      <span>Saldo Bancario Ajustado:</span>
                      <span className="font-mono text-base">{fmt(adjustedBankBalance, selectedAccount?.currency)}</span>
                    </div>
                  </div>

                  {/* Right Column: Internal ledger reconciliation */}
                  <div className="space-y-4 pl-0 md:pl-6 pt-4 md:pt-0">
                    <h4 className="font-bold text-[#003366] text-xs uppercase tracking-widest border-b border-slate-100 pb-2">Sección 2: Libros</h4>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Saldo en Libros al {new Date(endDate).toLocaleDateString('es-DO')}:</span>
                      <span className="font-mono font-bold text-slate-800">{fmt(bookBalanceAtCutoff, selectedAccount?.currency)}</span>
                    </div>

                    <div className="flex justify-between text-sm text-slate-400">
                      <span>(+) Ajustes / Depósitos no Registrados:</span>
                      <span className="font-mono">RD$0.00</span>
                    </div>

                    <div className="flex justify-between text-sm text-slate-400">
                      <span>(-) Cargos Bancarios no Registrados:</span>
                      <span className="font-mono">RD$0.00</span>
                    </div>

                    <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between font-bold text-slate-950">
                      <span>Saldo en Libros Ajustado:</span>
                      <span className="font-mono text-base">{fmt(adjustedBookBalance, selectedAccount?.currency)}</span>
                    </div>
                  </div>
                </div>

                {/* Final status bar */}
                <div className={clsx("px-6 py-4 flex items-center justify-between border-t border-slate-100 text-sm", isReconciled ? 'bg-emerald-50/50' : 'bg-amber-50/50')}>
                  <div className="flex items-center gap-2">
                    {isReconciled ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="font-medium text-slate-700">
                      {isReconciled 
                        ? 'La conciliación cuadra perfectamente. Puedes asentar este periodo.' 
                        : `Existe una diferencia contable de ${fmt(Math.abs(difference), selectedAccount?.currency)}. Revisa tus depósitos y retiros en tránsito.`
                      }
                    </span>
                  </div>
                  <button
                    onClick={handlePostReconciliation}
                    disabled={submitting || !isReconciled}
                    className={clsx(
                      "px-5 py-2 rounded-lg font-bold shadow text-white flex items-center gap-1.5 transition-all",
                      isReconciled 
                        ? 'bg-[#003366] hover:bg-[#002244] cursor-pointer' 
                        : 'bg-slate-300 cursor-not-allowed opacity-60'
                    )}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Asentar Conciliación
                  </button>
                </div>
              </div>

              {/* Transactions Checklist Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Detalle de Movimientos en el Periodo</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Marca los movimientos que han sido confirmados/debitados en el extracto del banco.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500 uppercase font-bold border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-3.5 text-center w-12">Cleared</th>
                        <th className="px-6 py-3.5">Fecha</th>
                        <th className="px-6 py-3.5">Descripción / Referencia</th>
                        <th className="px-6 py-3.5">Tipo</th>
                        <th className="px-6 py-3.5 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            No se encontraron movimientos bancarios en el rango de fechas seleccionado.
                          </td>
                        </tr>
                      ) : (
                        periodTransactions.map(tx => {
                          const isCleared = clearedTxIds.has(tx.id);
                          const isIncoming = ['deposit', 'transfer_in'].includes(tx.type);
                          return (
                            <tr key={tx.id} className={clsx("hover:bg-slate-50/50 transition-colors", isCleared ? 'bg-slate-50/20' : '')}>
                              <td className="px-6 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isCleared}
                                  onChange={() => handleToggleCleared(tx.id)}
                                  className="h-4.5 w-4.5 rounded border-slate-300 text-[#003366] focus:ring-[#003366] cursor-pointer"
                                />
                              </td>
                              <td className="px-6 py-3 font-medium text-slate-600 font-mono text-xs">
                                {new Date(tx.date).toLocaleDateString('es-DO')}
                              </td>
                              <td className="px-6 py-3">
                                <p className="font-semibold text-slate-800 text-sm">{tx.description || 'Movimiento Bancario'}</p>
                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{tx.reference || 'Sin ref'}</p>
                              </td>
                              <td className="px-6 py-3">
                                <span className={clsx(
                                  "inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                  isIncoming ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                )}>
                                  {tx.type}
                                </span>
                              </td>
                              <td className={clsx("px-6 py-3 text-right font-mono font-bold", isIncoming ? 'text-emerald-600' : 'text-slate-800')}>
                                {isIncoming ? '+' : '-'}{fmt(tx.amount, selectedAccount?.currency)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Reconciliation History Sidebar */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#C5A059]" /> Historial de Conciliaciones
                </h3>
                <p className="text-xs text-slate-500">Historial de cierres contables y conciliaciones publicadas en esta cuenta.</p>
                
                <div className="space-y-3 pt-2">
                  {reconciliations.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                      No hay conciliaciones previas registradas.
                    </div>
                  ) : (
                    reconciliations.map(recon => (
                      <div key={recon.id} className="border border-slate-100 hover:border-slate-200 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-all text-xs space-y-2">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-[#003366]">Corte al {new Date(recon.endDate).toLocaleDateString('es-DO')}</span>
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold uppercase text-[9px]">
                            {recon.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 mt-1">
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-400">Saldo Libros</span>
                            <span className="font-mono font-bold">{fmt(recon.closingBalance, selectedAccount?.currency)}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-400">Fecha Registro</span>
                            <span>{new Date(recon.createdAt).toLocaleDateString('es-DO')}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Advanced Accounting Tips Card */}
              <div className="bg-[#003366] text-white rounded-xl shadow-lg p-6 relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                  <Landmark className="w-36 h-36" />
                </div>
                <div className="relative z-10 space-y-3">
                  <h4 className="font-bold text-[#C5A059] text-xs uppercase tracking-wider flex items-center gap-1">
                    <HelpCircle className="w-4 h-4" /> Nota del Auditor Contable
                  </h4>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Recuerda que para una correcta auditoría fiscal ante la DGII, la conciliación debe asentar el balance a final de cada periodo mensual.
                  </p>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Los depósitos y cheques en tránsito identificados aquí deben ser liquidados o aclarados a la brevedad en el siguiente ciclo fiscal para evitar discrepancias de ITBIS o Retenciones.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
