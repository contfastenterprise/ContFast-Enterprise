'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { BookOpen, Search, Plus, RefreshCw, FileText, FileCheck, X, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

// -- Types --
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  status: string;
}

interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  status: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
}

// -- Helpers --
const typeLabels: Record<AccountType, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Capital',
  revenue: 'Ingreso',
  expense: 'Gasto'
};

const fmt = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(num || 0);
};

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'journals'>('catalog');
  const [loading, setLoading] = useState(true);

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);

  // Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [accForm, setAccForm] = useState({ code: '', name: '', type: 'asset' as AccountType });
  const [journalForm, setJournalForm] = useState({ date: new Date().toISOString().split('T')[0], reference: '', description: '' });
  const [journalLines, setJournalLines] = useState([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'catalog') {
        const res = await fetch('/api/v1/accounting/accounts');
        const data = await res.json();
        if (data.success) setAccounts(data.data);
      } else {
        const res = await fetch('/api/v1/accounting/journals');
        const data = await res.json();
        if (data.success) setJournals(data.data);
      }
    } catch (err) {
      toast.error('Error cargando datos de contabilidad.');
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cuenta contable creada');
        setShowAccountModal(false);
        setAccForm({ code: '', name: '', type: 'asset' });
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al crear cuenta');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddJournalLine = () => {
    setJournalLines([...journalLines, { accountId: '', debit: 0, credit: 0 }]);
  };

  const handleJournalLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...journalLines];
    if (field === 'accountId') newLines[index].accountId = value as string;
    if (field === 'debit') {
      newLines[index].debit = parseFloat(value as string) || 0;
      if (newLines[index].debit > 0) newLines[index].credit = 0; // mutually exclusive visually
    }
    if (field === 'credit') {
      newLines[index].credit = parseFloat(value as string) || 0;
      if (newLines[index].credit > 0) newLines[index].debit = 0;
    }
    setJournalLines(newLines);
  };

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error('El asiento no cuadra. Débitos y Créditos deben ser iguales.');
      return;
    }
    if (totalDebit === 0) {
      toast.error('El asiento no puede estar en cero.');
      return;
    }
    if (journalLines.some(l => !l.accountId)) {
      toast.error('Todas las líneas deben tener una cuenta asignada.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/accounting/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...journalForm, lines: journalLines })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Asiento contable registrado exitosamente');
        setShowJournalModal(false);
        setJournalForm({ date: new Date().toISOString().split('T')[0], reference: '', description: '' });
        setJournalLines([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al registrar asiento');
      }
    } catch (error) {
      toast.error('Error de red al crear asiento');
    } finally {
      setSubmitting(false);
    }
  };

  const totalDebits = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = journalLines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <BookOpen className="h-3 w-3" /> Contabilidad Financiera
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Libro Mayor y Asientos
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Gestión del catálogo de cuentas y transacciones de diario general.
            </p>
          </div>
          <div className="flex gap-3">
            {activeTab === 'catalog' ? (
              <button
                onClick={() => setShowAccountModal(true)}
                className="bg-white border border-gray-200 hover:bg-gray-50 text-[#003366] font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-sm"
              >
                <Plus className="h-4 w-4" /> Nueva Cuenta
              </button>
            ) : null}
            <button
              onClick={() => setShowJournalModal(true)}
              className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm"
            >
              <FileText className="h-4 w-4" /> Nuevo Asiento
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 inline-flex shadow-sm">
          <button
            onClick={() => setActiveTab('catalog')}
            className={clsx(
              'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all',
              activeTab === 'catalog' ? 'bg-[#003366] text-white shadow' : 'text-on-surface-variant/70 hover:text-slate-700'
            )}
          >
            Catálogo de Cuentas
          </button>
          <button
            onClick={() => setActiveTab('journals')}
            className={clsx(
              'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all',
              activeTab === 'journals' ? 'bg-[#003366] text-white shadow' : 'text-on-surface-variant/70 hover:text-slate-700'
            )}
          >
            Asientos Contables
          </button>
        </div>

        {/* CATALOG TAB */}
        <AnimatePresence mode="wait">
          {activeTab === 'catalog' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-on-surface-variant/70 text-xs uppercase tracking-wider font-semibold">
                        <th className="p-4 w-32">Código</th>
                        <th className="p-4">Nombre de la Cuenta</th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan={4} className="p-8 text-center text-on-surface-variant"><RefreshCw className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                      ) : accounts.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-on-surface-variant/70">No hay cuentas registradas en el catálogo.</td></tr>
                      ) : (
                        accounts.map((acc) => (
                          <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono text-sm font-semibold text-[#003366]">{acc.code}</td>
                            <td className="p-4 text-sm font-medium text-slate-800">{acc.name}</td>
                            <td className="p-4">
                              <span className={clsx(
                                'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                                acc.type === 'asset' && 'bg-blue-100 text-blue-800',
                                acc.type === 'liability' && 'bg-rose-100 text-rose-800',
                                acc.type === 'equity' && 'bg-purple-100 text-purple-800',
                                acc.type === 'revenue' && 'bg-emerald-100 text-emerald-800',
                                acc.type === 'expense' && 'bg-amber-100 text-amber-800'
                              )}>
                                {typeLabels[acc.type]}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Activo</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* JOURNALS TAB */}
          {activeTab === 'journals' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : journals.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                  <FileText className="h-12 w-12 text-on-surface-variant mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-[#003366]">Sin Asientos Contables</h3>
                  <p className="text-on-surface-variant/70 text-sm mt-2">No se han registrado transacciones en el diario general.</p>
                </div>
              ) : (
                journals.map((journal) => (
                  <div key={journal.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden group">
                    <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-white border border-gray-200 rounded px-3 py-1.5 shadow-sm text-center">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase">Fecha</p>
                          <p className="font-mono text-sm font-semibold text-[#003366]">
                            {new Date(journal.date).toLocaleDateString('es-DO')}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800">{journal.description}</h4>
                          {journal.reference && <p className="text-xs text-on-surface-variant/70 font-mono mt-0.5">Ref: {journal.reference}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase rounded-full">
                          Contabilizado
                        </span>
                      </div>
                    </div>
                    <div className="p-0">
                      <table className="w-full text-sm">
                        <thead className="bg-white border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase">Cuenta</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-on-surface-variant uppercase w-32">Débito</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-on-surface-variant uppercase w-32">Crédito</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {journal.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-slate-50/50">
                              <td className="px-6 py-3">
                                <span className="font-mono font-semibold text-[#003366] mr-2">{line.accountCode}</span>
                                <span className="text-on-surface-variant/80">{line.accountName}</span>
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-slate-700">
                                {parseFloat(line.debit) > 0 ? fmt(line.debit) : ''}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-slate-700">
                                {parseFloat(line.credit) > 0 ? fmt(line.credit) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50/80 border-t border-gray-200">
                          <tr>
                            <td className="px-6 py-3 text-right font-bold text-on-surface-variant/70 text-xs uppercase tracking-widest">Totales</td>
                            <td className="px-6 py-3 text-right font-mono font-bold text-[#003366]">{fmt(journal.totalDebit)}</td>
                            <td className="px-6 py-3 text-right font-mono font-bold text-[#003366]">{fmt(journal.totalCredit)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MODAL: NEW ACCOUNT */}
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAccountModal(false)} className="absolute inset-0 bg-surface-container-low/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-[#c5a059]" /> Nueva Cuenta Contable</h3>
                <button onClick={() => setShowAccountModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateAccount} className="p-6 space-y-5">
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Código</label>
                  <input type="text" required value={accForm.code} onChange={e => setAccForm({ ...accForm, code: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. 1.1.01" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Nombre de Cuenta</label>
                  <input type="text" required value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Efectivo en Caja y Banco" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Tipo de Cuenta</label>
                  <select required value={accForm.type} onChange={e => setAccForm({ ...accForm, type: e.target.value as AccountType })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors">
                    <option value="asset">Activo</option>
                    <option value="liability">Pasivo</option>
                    <option value="equity">Capital</option>
                    <option value="revenue">Ingreso</option>
                    <option value="expense">Gasto</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowAccountModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />} Guardar Cuenta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NEW JOURNAL ENTRY */}
      <AnimatePresence>
        {showJournalModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowJournalModal(false)} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733] shrink-0">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-[#c5a059]" /> Nuevo Asiento Contable</h3>
                <button onClick={() => setShowJournalModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <div className="overflow-y-auto p-6 bg-surface-container-highest flex-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Fecha</label>
                    <input type="date" required value={journalForm.date} onChange={e => setJournalForm({ ...journalForm, date: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Referencia</label>
                    <input type="text" value={journalForm.reference} onChange={e => setJournalForm({ ...journalForm, reference: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. CHK-1024" />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-sm font-semibold text-primary block mb-1">Concepto / Descripción</label>
                    <input type="text" required value={journalForm.description} onChange={e => setJournalForm({ ...journalForm, description: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Registro de..." />
                  </div>
                </div>

                <div className="bg-surface-container-highest border border-[#003366] rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-[#001733] border-b border-[#003366]">
                      <tr>
                        <th className="px-4 py-3 text-sm font-semibold text-primary">Cuenta Contable</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-primary w-40">Débito</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-primary w-40">Crédito</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/50">
                      {journalLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-surface-container-high/30">
                          <td className="p-2">
                            <select required value={line.accountId} onChange={e => handleJournalLineChange(idx, 'accountId', e.target.value)} className="w-full bg-surface-container-highest border border-outline rounded px-2 py-1.5 text-primary focus:border-[#c5a059] outline-none">
                              <option value="" disabled>Seleccione cuenta...</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => handleJournalLineChange(idx, 'debit', e.target.value)} disabled={line.credit > 0} className="w-full bg-surface-container-highest border border-outline rounded px-2 py-1.5 text-right font-mono text-primary focus:border-[#c5a059] outline-none disabled:opacity-50" placeholder="0.00" />
                          </td>
                          <td className="p-2">
                            <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => handleJournalLineChange(idx, 'credit', e.target.value)} disabled={line.debit > 0} className="w-full bg-surface-container-highest border border-outline rounded px-2 py-1.5 text-right font-mono text-primary focus:border-[#c5a059] outline-none disabled:opacity-50" placeholder="0.00" />
                          </td>
                          <td className="p-2 text-center">
                            {journalLines.length > 2 && (
                              <button type="button" onClick={() => setJournalLines(journalLines.filter((_, i) => i !== idx))} className="text-on-surface-variant hover:text-red-500"><X className="w-4 h-4" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-3 border-t border-[#003366] bg-[#001733]/50">
                    <button type="button" onClick={handleAddJournalLine} className="text-xs font-bold text-[#c5a059] hover:text-[#d4b069] flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Agregar Línea
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer Totals */}
              <div className="bg-[#001733] border-t border-[#003366] p-6 shrink-0 grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Débitos</p>
                    <p className="font-mono text-xl font-bold text-emerald-400">{fmt(totalDebits)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Créditos</p>
                    <p className="font-mono text-xl font-bold text-emerald-400">{fmt(totalCredits)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-end">
                  {!isBalanced && totalDebits > 0 && (
                    <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-500/20">
                      <AlertTriangle className="w-4 h-4" /> Asiento Descuadrado
                    </div>
                  )}
                  <button type="button" onClick={() => setShowJournalModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleCreateJournal} disabled={!isBalanced || submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                    Contabilizar Asiento
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
