'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { BookOpen, Plus, Search, RefreshCw, X, Calendar, FileText, ArrowRightLeft, Check, AlertTriangle, Layers, CreditCard, ChevronRight, FileSpreadsheet, PlusCircle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function AccountingDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'chart' | 'entries'>('chart');

  // Core accounting data
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total_pages: 1 });

  // Modals state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [entrySearchQuery, setEntrySearchQuery] = useState('');
  const [entryPage, setEntryPage] = useState(1);

  // Create Account Form State
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [accountParentId, setAccountParentId] = useState('');

  // Create Journal Entry Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryDescription, setEntryDescription] = useState('');
  const [entryReference, setEntryReference] = useState('');
  const [entryLines, setEntryLines] = useState<any[]>([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
  ]);

  // Initial load
  const loadAccountingData = async () => {
    try {
      setLoading(true);
      // Fetch Chart of Accounts
      const chartRes = await fetch('/api/v1/accounting/accounts');
      const chartData = await chartRes.json();
      if (chartData.success) {
        setAccounts(chartData.data || []);
      }

      // Fetch Journal Entries
      await loadEntries(entryPage);
    } catch (error) {
      console.error('Failed to load accounting data:', error);
      toast.error('Error al cargar datos contables');
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async (page: number) => {
    try {
      const entriesRes = await fetch(`/api/v1/accounting/entries?page=${page}&per_page=15`);
      const entriesData = await entriesRes.json();
      if (entriesData.success) {
        setEntries(entriesData.data || []);
        setPagination(entriesData.meta || { page: 1, total_pages: 1 });
      }
    } catch (error) {
      console.error('Failed to load journal entries:', error);
    }
  };

  useEffect(() => {
    loadAccountingData();
  }, []);

  useEffect(() => {
    loadEntries(entryPage);
  }, [entryPage]);

  // Handle Account Submission
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountCode || !accountName) {
      toast.error('Complete los campos obligatorios');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: accountCode,
          name: accountName,
          type: accountType,
          parentId: accountParentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al crear la cuenta contable');
      }

      toast.success('Cuenta contable creada correctamente');
      setShowAccountModal(false);
      setAccountCode('');
      setAccountName('');
      setAccountParentId('');
      
      // Refresh Chart
      const chartRes = await fetch('/api/v1/accounting/accounts');
      const chartData = await chartRes.json();
      if (chartData.success) {
        setAccounts(chartData.data || []);
      }
    } catch (error: any) {
      toast.error('Error de registro', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Journal Entry lines management
  const handleAddLine = () => {
    setEntryLines([...entryLines, { accountId: '', debit: 0, credit: 0 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (entryLines.length <= 2) {
      toast.error('Un asiento contable requiere al menos 2 líneas para partida doble');
      return;
    }
    const newLines = [...entryLines];
    newLines.splice(index, 1);
    setEntryLines(newLines);
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...entryLines];
    if (field === 'accountId') {
      newLines[index].accountId = value;
    } else if (field === 'debit') {
      newLines[index].debit = parseFloat(value) || 0;
    } else if (field === 'credit') {
      newLines[index].credit = parseFloat(value) || 0;
    }
    setEntryLines(newLines);
  };

  // Double entry totals calculation
  const totalDebits = entryLines.reduce((acc, curr) => acc + curr.debit, 0);
  const totalCredits = entryLines.reduce((acc, curr) => acc + curr.credit, 0);
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01 && totalDebits > 0;

  // Handle Journal Entry Submission
  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryDescription) {
      toast.error('Describa el concepto del asiento contable');
      return;
    }
    if (!isBalanced) {
      toast.error('El asiento no está balanceado. Débito total debe ser igual al Crédito total.');
      return;
    }
    // Verify all lines have accounts
    if (entryLines.some(l => !l.accountId)) {
      toast.error('Seleccione una cuenta contable para todas las líneas');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: entryDate,
          description: entryDescription,
          reference: entryReference || undefined,
          lines: entryLines.map(l => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar el asiento contable');
      }

      toast.success('Asiento contable registrado con éxito');
      setShowEntryModal(false);
      setEntryDescription('');
      setEntryReference('');
      setEntryLines([
        { accountId: '', debit: 0, credit: 0 },
        { accountId: '', debit: 0, credit: 0 },
      ]);
      loadEntries(1);
    } catch (error: any) {
      toast.error('Error de registro', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter(acc => 
    acc.code.includes(searchQuery) || 
    acc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group accounts by level/parent structure if needed or sort by code order
  const sortedAccounts = [...filteredAccounts].sort((a, b) => a.code.localeCompare(b.code));

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-slate-400 text-sm">Cargando catálogo contable y diario general...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const accountTypeMap: Record<string, string> = {
    asset: 'Activo',
    liability: 'Pasivo',
    equity: 'Capital',
    revenue: 'Ingresos',
    expense: 'Gastos',
  };

  const accountTypeColors: Record<string, string> = {
    asset: 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/20',
    liability: 'text-rose-500 bg-rose-500/10 ring-rose-500/20',
    equity: 'text-purple-500 bg-purple-500/10 ring-purple-500/20',
    revenue: 'text-blue-500 bg-blue-500/10 ring-blue-500/20',
    expense: 'text-amber-500 bg-amber-500/10 ring-amber-500/20',
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-amber-500" />
              Contabilidad y Catálogo General
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Consulte el Catálogo de Cuentas, administre asientos de doble entrada y controle la sanidad financiera de la empresa.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowAccountModal(true)}
              className="flex items-center gap-2 rounded-md bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-350 hover:bg-slate-850 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Crear Cuenta Contable
            </button>
            <button
              onClick={() => setShowEntryModal(true)}
              className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
            >
              <Plus className="h-4 w-4" />
              Registrar Asiento Diario
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('chart')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'chart'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Layers className="h-4 w-4" />
            Catálogo de Cuentas
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'entries'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <ArrowRightLeft className="h-4 w-4" />
            Asientos de Diario
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'chart' ? (
          <section className="space-y-4">
            
            {/* Search Filter */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por código o nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 block w-full rounded-md border-0 bg-slate-900 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              />
            </div>

            {/* Catalog List */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-350">
                  <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-6">Código Cuenta</th>
                      <th className="py-3 px-6">Nombre de Cuenta</th>
                      <th className="py-3 px-6">Tipo</th>
                      <th className="py-3 px-6">Nivel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-855">
                    {sortedAccounts.map((acc) => {
                      const dots = acc.code.split('.').length - 1;
                      return (
                        <tr
                          key={acc.id}
                          className="hover:bg-slate-950/20 transition-colors"
                        >
                          <td className="py-3 px-6 font-mono text-xs text-amber-500 font-bold">
                            {acc.code}
                          </td>
                          <td className="py-3 px-6">
                            <span
                              style={{ paddingLeft: `${dots * 16}px` }}
                              className={`flex items-center gap-1.5 ${
                                dots === 0 ? 'font-bold text-white text-sm' : 'text-slate-350 text-xs'
                              }`}
                            >
                              {dots > 0 && <ChevronRight className="h-3 w-3 text-slate-650 inline" />}
                              {acc.name}
                            </span>
                          </td>
                          <td className="py-3 px-6">
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset uppercase ${
                                accountTypeColors[acc.type] || 'bg-slate-500/10 text-slate-400'
                              }`}
                            >
                              {accountTypeMap[acc.type] || acc.type}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-slate-550 text-xs font-mono">
                            Nivel {dots + 1}
                          </td>
                        </tr>
                      );
                    })}
                    {sortedAccounts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-550">
                          No se encontraron cuentas contables.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        ) : (
          <section className="space-y-4">
            
            {/* Journal Entries List */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg p-6 space-y-6">
              <h3 className="text-base font-semibold text-white uppercase tracking-wider">Historial del Diario General</h3>
              
              <div className="space-y-6">
                {entries.map((entry) => {
                  const entryTotalDebit = entry.lines.reduce((s: number, l: any) => s + parseFloat(l.debit || 0), 0);
                  return (
                    <div
                      key={entry.id}
                      className="p-5 rounded-lg bg-slate-950 border border-slate-850 space-y-4 text-xs hover:border-slate-800 transition-colors"
                    >
                      {/* Entry Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-900 pb-3">
                        <div className="space-y-1">
                          <p className="font-bold text-white text-sm flex items-center gap-1.5">
                            <FileSpreadsheet className="h-4 w-4 text-amber-500" />
                            {entry.description}
                          </p>
                          {entry.reference && (
                            <span className="text-[10px] text-slate-500 font-mono">Referencia: {entry.reference}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-slate-450 font-mono text-[11px]">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-550" />
                            {new Date(entry.date).toLocaleDateString('es-DO')}
                          </span>
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20 uppercase">
                            {entry.status}
                          </span>
                        </div>
                      </div>

                      {/* Entry Lines Ledger */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] text-slate-350">
                          <thead>
                            <tr className="text-slate-500 uppercase font-semibold border-b border-slate-900">
                              <th className="py-2">Código Cuenta</th>
                              <th className="py-2">Cuenta Contable</th>
                              <th className="py-2 text-right">Débito</th>
                              <th className="py-2 text-right">Crédito</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900">
                            {entry.lines.map((line: any) => (
                              <tr key={line.id} className="hover:bg-slate-900/40">
                                <td className="py-2 font-mono text-slate-400">{line.accountCode}</td>
                                <td className="py-2 font-semibold text-white">{line.accountName}</td>
                                <td className="py-2 text-right text-emerald-500">
                                  {parseFloat(line.debit) > 0 ? `RD$ ${parseFloat(line.debit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td className="py-2 text-right text-white">
                                  {parseFloat(line.credit) > 0 ? `RD$ ${parseFloat(line.credit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                              </tr>
                            ))}
                            <tr className="font-bold text-white border-t border-slate-800 bg-slate-900/25">
                              <td colSpan={2} className="py-2 text-right uppercase">Balance Total:</td>
                              <td className="py-2 text-right text-emerald-500">
                                RD$ {entryTotalDebit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 text-right">
                                RD$ {entryTotalDebit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {entries.length === 0 && (
                  <p className="text-slate-500 text-center py-6">No hay asientos de diario registrados en el sistema.</p>
                )}

                {/* Pagination */}
                {pagination.total_pages > 1 && (
                  <div className="flex justify-between items-center pt-4 border-t border-slate-900">
                    <button
                      onClick={() => setEntryPage(p => Math.max(1, p - 1))}
                      disabled={entryPage === 1}
                      className="px-3 py-1.5 rounded bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-850 text-xs disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <span className="text-xs text-slate-550">
                      Página {entryPage} de {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setEntryPage(p => Math.min(pagination.total_pages, p + 1))}
                      disabled={entryPage === pagination.total_pages}
                      className="px-3 py-1.5 rounded bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-850 text-xs disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            </div>

          </section>
        )}

      </div>

      {/* MODAL: Crear Cuenta Contable */}
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
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Añadir Cuenta Contable</h3>
                <button onClick={() => setShowAccountModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Código de Cuenta</label>
                    <input
                      type="text"
                      value={accountCode}
                      onChange={(e) => setAccountCode(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
                      placeholder="1.1.01"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Tipo de Cuenta</label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as any)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    >
                      <option value="asset">Activo</option>
                      <option value="liability">Pasivo</option>
                      <option value="equity">Capital</option>
                      <option value="revenue">Ingresos</option>
                      <option value="expense">Gastos</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block text-slate-300 font-semibold uppercase">Nombre de Cuenta</label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Caja Chica Administrativa"
                      required
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block text-slate-300 font-semibold uppercase">Cuenta Contable Superior (Padre)</label>
                    <select
                      value={accountParentId}
                      onChange={(e) => setAccountParentId(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    >
                      <option value="">Ninguna (Cuenta de nivel raíz)</option>
                      {accounts
                        .filter((acc) => acc.code.split('.').length < 3) // restrict parent to root levels
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                    </select>
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
                    Crear Cuenta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Registrar Asiento Diario */}
      <AnimatePresence>
        {showEntryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEntryModal(false)}
              className="fixed inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-4xl w-full shadow-2xl z-10 text-slate-300 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-amber-500" />
                  Registrar Asiento Contable
                </h3>
                <button onClick={() => setShowEntryModal(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateEntry} className="space-y-6 text-xs">
                
                {/* Meta details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Fecha Asiento</label>
                    <input
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Referencia Documental</label>
                    <input
                      type="text"
                      value={entryReference}
                      onChange={(e) => setEntryReference(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Factura, cheque, etc. (Opcional)"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-slate-300 font-semibold uppercase">Concepto / Glosa</label>
                    <input
                      type="text"
                      value={entryDescription}
                      onChange={(e) => setEntryDescription(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Registro cobro factura..."
                      required
                    />
                  </div>
                </div>

                {/* Double Entry Ledger Lines */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h4 className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Partida Doble (Líneas de Asiento)</h4>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="flex items-center gap-1 rounded bg-slate-950 border border-slate-800 px-2.5 py-1 text-[10.5px] font-semibold text-slate-350 hover:bg-slate-850"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-amber-500" />
                      Agregar Línea
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
                    {entryLines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                        
                        {/* Selector de cuenta */}
                        <div className="col-span-6">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                            className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-xs"
                            required
                          >
                            <option value="">-- Seleccionar Cuenta Contable --</option>
                            {accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name} ({accountTypeMap[acc.type]})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Débito */}
                        <div className="col-span-2.5">
                          <input
                            type="number"
                            value={line.debit || ''}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                            disabled={line.credit > 0}
                            className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-xs text-right font-mono"
                            placeholder="Débito 0.00"
                            min={0}
                            step="any"
                          />
                        </div>

                        {/* Crédito */}
                        <div className="col-span-2.5">
                          <input
                            type="number"
                            value={line.credit || ''}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                            disabled={line.debit > 0}
                            className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3.5 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-xs text-right font-mono"
                            placeholder="Crédito 0.00"
                            min={0}
                            step="any"
                          />
                        </div>

                        {/* Eliminar línea */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-slate-500 hover:text-red-400 p-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>

                {/* Ledger balances summary */}
                <div className="bg-slate-950/60 rounded-lg border border-slate-850 p-4 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-6 text-[11px] font-mono text-slate-400">
                    <div>
                      <span>Total Débitos:</span>
                      <p className="text-sm font-bold text-emerald-500 mt-0.5">
                        RD$ {totalDebits.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span>Total Créditos:</span>
                      <p className="text-sm font-bold text-white mt-0.5">
                        RD$ {totalCredits.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {difference > 0 && (
                      <div>
                        <span>Desbalance:</span>
                        <p className="text-sm font-bold text-red-500 mt-0.5">
                          RD$ {difference.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    {isBalanced ? (
                      <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded border border-emerald-500/20 text-[10px] uppercase font-bold">
                        <Check className="h-4 w-4" /> Asiento Balanceado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 bg-rose-500/10 text-rose-400 px-3 py-1.5 rounded border border-rose-500/20 text-[10px] uppercase font-bold">
                        <AlertTriangle className="h-4 w-4" /> Asiento Desbalanceado
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEntryModal(false)}
                    className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-350 hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !isBalanced}
                    className="rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Guardando asiento...' : 'Registrar Asiento'}
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
