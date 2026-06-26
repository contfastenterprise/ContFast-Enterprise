'use client';

import { useState, useEffect, Fragment } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { BookOpen, Search, Plus, RefreshCw, FileText, FileCheck, X, AlertTriangle, ArrowRightLeft, ChevronDown, ChevronUp, Printer } from 'lucide-react';
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
  isTransactional: boolean;
  level: number;
  nature: 'debit' | 'credit';
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
  const [activeTab, setActiveTab] = useState<'catalog' | 'journals' | 'ledger' | 'trial-balance' | 'financials' | 'periods' | 'mappings'>('catalog');
  const [loading, setLoading] = useState(true);

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);

  // Filters & Row Expansion
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedJournals, setExpandedJournals] = useState<Record<string, boolean>>({});

  // Ledger Tab States
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState('');
  const [ledgerData, setLedgerData] = useState<any>(null);

  // Trial Balance Tab States
  const [trialBalanceData, setTrialBalanceData] = useState<any[]>([]);

  // Financials Tab States
  const [activeFinancialTab, setActiveFinancialTab] = useState<'income-statement' | 'balance-sheet'>('income-statement');
  const [financialsData, setFinancialsData] = useState<any>(null);

  // Periods Tab States
  const [periods, setPeriods] = useState<any[]>([]);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: '', startDate: '', endDate: '' });
  const [periodSubmitting, setPeriodSubmitting] = useState(false);

  // Mappings Tab States
  const [mappings, setMappings] = useState<any[]>([]);
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

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
  }, [activeTab, startDate, endDate, selectedLedgerAccount]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pre-load accounts for dropdowns
      const accRes = await fetch('/api/v1/accounting/accounts');
      const accData = await accRes.json();
      if (accData.success) {
        setAccounts(accData.data);
      }

      const formattedStart = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const formattedEnd = endDate || new Date().toISOString().split('T')[0];

      if (activeTab === 'catalog') {
        // accounts already loaded
      } else if (activeTab === 'journals') {
        let url = '/api/v1/accounting/journals';
        const params = [];
        if (startDate) params.push(`startDate=${startDate}`);
        if (endDate) params.push(`endDate=${endDate}`);
        if (params.length > 0) url += `?${params.join('&')}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) setJournals(data.data);
      } else if (activeTab === 'ledger') {
        if (selectedLedgerAccount) {
          const res = await fetch(`/api/v1/accounting/reports/ledger?accountId=${selectedLedgerAccount}&startDate=${formattedStart}&endDate=${formattedEnd}`);
          const data = await res.json();
          if (data.success) setLedgerData(data.data);
        } else {
          setLedgerData(null);
        }
      } else if (activeTab === 'trial-balance') {
        const res = await fetch(`/api/v1/accounting/reports/trial-balance?startDate=${formattedStart}&endDate=${formattedEnd}`);
        const data = await res.json();
        if (data.success) setTrialBalanceData(data.data);
      } else if (activeTab === 'financials') {
        const res = await fetch(`/api/v1/accounting/reports/financials?startDate=${formattedStart}&endDate=${formattedEnd}`);
        const data = await res.json();
        if (data.success) setFinancialsData(data.data);
      } else if (activeTab === 'periods') {
        const res = await fetch('/api/v1/accounting/periods');
        const data = await res.json();
        if (data.success) setPeriods(data.data);
      } else if (activeTab === 'mappings') {
        const res = await fetch('/api/v1/accounting/mappings');
        const data = await res.json();
        if (data.success) setMappings(data.data);
      }
    } catch (err) {
      toast.error('Error cargando datos de contabilidad.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedJournals(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handlePrintCatalog = async () => {
    const toastId = toast.loading('Preparando plantilla de impresión del catálogo...');
    try {
      const res = await fetch('/api/v1/company/settings');
      const settingsData = await res.json();
      const company = settingsData.data || {};
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'ContFast'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Catálogo de Cuentas - ${company.companyName || 'ContFast'}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 30px; line-height: 1.4; font-size: 12px; }
              .header { display: flex; justify-content: flex-start; align-items: center; gap: 20px; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 20px; }
              .company-info { font-size: 11px; color: #555; line-height: 1.4; flex-grow: 1; }
              .doc-info { text-align: right; }
              .subtitle { font-size: 16pt; color: #003366; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 8px 10px; font-size: 11px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
              tr.level-1 { background-color: #f1f5f9; font-weight: bold; }
              tr.level-2 { font-weight: bold; }
              .indent-1 { padding-left: 10px; }
              .indent-2 { padding-left: 20px; }
              .indent-3 { padding-left: 30px; }
              .indent-4 { padding-left: 40px; }
              .text-center { text-align: center; }
              .footer { margin-top: 50px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
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
                <div class="subtitle">CATÁLOGO DE CUENTAS</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Total Cuentas:</strong> ${accounts.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 150px;">Código</th>
                  <th>Nombre de la Cuenta</th>
                  <th style="width: 120px;">Tipo</th>
                  <th style="width: 100px; text-align: center;">Nivel</th>
                </tr>
              </thead>
              <tbody>
                ${accounts.map(acc => {
                  const segments = acc.code.split('.');
                  const level = segments.length;
                  const indentClass = `indent-${Math.min(level - 1, 4)}`;
                  const levelClass = level === 1 ? 'level-1' : level === 2 ? 'level-2' : '';
                  return `
                    <tr class="${levelClass}">
                      <td style="font-family: monospace;">${acc.code}</td>
                      <td class="${indentClass}">${acc.name}</td>
                      <td>${typeLabels[acc.type] || acc.type}</td>
                      <td class="text-center">${level}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="footer">
              Catálogo de Cuentas - Generado por ContFast Enterprise
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
      toast.success('Impresión del catálogo preparada con éxito', { id: toastId });
    } catch (err) {
      toast.error('Error al preparar impresión del catálogo', { id: toastId });
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

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setPeriodSubmitting(true);
    try {
      const res = await fetch('/api/v1/accounting/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(periodForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Período contable abierto con éxito.');
        setShowPeriodModal(false);
        setPeriodForm({ name: '', startDate: '', endDate: '' });
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al abrir período.');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setPeriodSubmitting(false);
    }
  };

  const handleTogglePeriodStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'open' ? 'closed' : 'open';
    const label = nextStatus === 'open' ? 'reabrir' : 'cerrar';
    if (!confirm(`¿Estás seguro que deseas ${label} este período contable?`)) return;

    try {
      const res = await fetch(`/api/v1/accounting/periods/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Período ${nextStatus === 'open' ? 'reabierto' : 'cerrado'} exitosamente.`);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al cambiar estado.');
      }
    } catch (err) {
      toast.error('Error de red');
    }
  };

  const handleUpdateMapping = async (mappingKey: string, accountId: string) => {
    setMappingSubmitting(true);
    try {
      const res = await fetch('/api/v1/accounting/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingKey, accountId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cuenta puente actualizada correctamente.');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al actualizar cuenta puente.');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setMappingSubmitting(false);
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
              <>
                <button
                  onClick={handlePrintCatalog}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-slate-700 font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-sm"
                >
                  <Printer className="h-4 w-4 text-[#C5A059]" /> Imprimir Catálogo
                </button>
                <button
                  onClick={() => setShowAccountModal(true)}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-[#003366] font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-sm"
                >
                  <Plus className="h-4 w-4" /> Nueva Cuenta
                </button>
              </>
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
        <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-gray-200 inline-flex shadow-sm">
          {[
            { id: 'catalog', label: 'Catálogo de Cuentas' },
            { id: 'journals', label: 'Asientos Contables' },
            { id: 'ledger', label: 'Libro Mayor' },
            { id: 'trial-balance', label: 'Balanza de Comprobación' },
            { id: 'financials', label: 'Estados Financieros' },
            { id: 'periods', label: 'Períodos Fiscales' },
            { id: 'mappings', label: 'Configuración Puente' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                'px-4 py-2.5 rounded-lg text-xs md:text-sm font-semibold transition-all',
                activeTab === tab.id ? 'bg-[#003366] text-white shadow' : 'text-slate-600 hover:text-slate-800'
              )}
            >
              {tab.label}
            </button>
          ))}
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
              
              {/* FILTROS DE FECHA */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Desde</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c5a059] transition-colors"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Hasta</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c5a059] transition-colors"
                  />
                </div>
                {(startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                  >
                    Limpiar Filtros
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : journals.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                  <FileText className="h-12 w-12 text-on-surface-variant mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-[#003366]">Sin Asientos Contables</h3>
                  <p className="text-on-surface-variant/70 text-sm mt-2">No se han registrado transacciones en el diario general para este rango.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                          <th className="p-4 w-10"></th>
                          <th className="p-4 w-32">Fecha</th>
                          <th className="p-4">Concepto / Descripción</th>
                          <th className="p-4 w-40">Referencia</th>
                          <th className="p-4 text-right w-36">Total Débito</th>
                          <th className="p-4 text-right w-36">Total Crédito</th>
                          <th className="p-4 text-center w-28">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {journals.map((journal) => {
                          const isExpanded = !!expandedJournals[journal.id];
                          return (
                            <Fragment key={journal.id}>
                              {/* Main Entry Row */}
                              <tr 
                                onClick={() => toggleExpand(journal.id)} 
                                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                              >
                                <td className="p-4 text-center">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-slate-400 -rotate-90 transition-transform" />
                                  )}
                                </td>
                                <td className="p-4 font-mono text-sm font-semibold text-[#003366]">
                                  {new Date(journal.date).toLocaleDateString('es-DO')}
                                </td>
                                <td className="p-4 font-semibold text-slate-800">{journal.description}</td>
                                <td className="p-4 font-mono text-xs text-slate-500">{journal.reference || '-'}</td>
                                <td className="p-4 text-right font-mono text-slate-700 font-bold">{fmt(journal.totalDebit)}</td>
                                <td className="p-4 text-right font-mono text-slate-700 font-bold">{fmt(journal.totalCredit)}</td>
                                <td className="p-4 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-800">
                                    Contabilizado
                                  </span>
                                </td>
                              </tr>
                              
                              {/* Expanded Entry Details (Lines) */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="bg-slate-50/50 p-4 border-l-4 border-[#C5A059]">
                                    <div className="pl-6 py-2">
                                      <table className="w-full text-xs text-slate-600 border-collapse">
                                        <thead>
                                          <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                                            <th className="py-2 text-left">Código Cuenta</th>
                                            <th className="py-2 text-left">Nombre Cuenta</th>
                                            <th className="py-2 text-right w-36">Débito</th>
                                            <th className="py-2 text-right w-36">Crédito</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {journal.lines.map((line) => (
                                            <tr key={line.id} className="hover:bg-slate-100/50">
                                              <td className="py-2.5 font-mono font-semibold text-[#003366]">{line.accountCode}</td>
                                              <td className="py-2.5">{line.accountName}</td>
                                              <td className="py-2.5 text-right font-mono text-slate-700">
                                                {parseFloat(line.debit) > 0 ? fmt(line.debit) : ''}
                                              </td>
                                              <td className="py-2.5 text-right font-mono text-slate-700">
                                                {parseFloat(line.credit) > 0 ? fmt(line.credit) : ''}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* LEDGER TAB */}
          {activeTab === 'ledger' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Seleccionar Cuenta Contable</label>
                  <select 
                    value={selectedLedgerAccount} 
                    onChange={e => setSelectedLedgerAccount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c5a059] transition-colors"
                  >
                    <option value="">-- Seleccione una cuenta --</option>
                    {accounts.filter(a => a.status === 'active').map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-auto flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none" />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : !ledgerData ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
                  <BookOpen className="h-12 w-12 text-on-surface-variant mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-[#003366]">Consulta de Auxiliar</h3>
                  <p className="text-on-surface-variant/70 text-sm mt-2">Seleccione una cuenta contable para visualizar sus movimientos y saldos acumulados.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Ledger Header Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Saldo Inicial</p>
                      <p className="text-2xl font-bold font-mono mt-1 text-[#003366]">{fmt(ledgerData.beginningBalance)}</p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Naturaleza Cuenta</p>
                      <p className="text-2xl font-bold capitalize mt-1 text-slate-800">{ledgerData.account.nature === 'debit' ? 'Deudora' : 'Acreedora'}</p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Saldo Final</p>
                      <p className="text-2xl font-bold font-mono mt-1 text-emerald-600">{fmt(ledgerData.endingBalance)}</p>
                    </div>
                  </div>

                  {/* Movements list */}
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                          <th className="p-4 w-32">Fecha</th>
                          <th className="p-4">Detalle / Concepto</th>
                          <th className="p-4 w-36">Referencia</th>
                          <th className="p-4 text-right w-36">Débito</th>
                          <th className="p-4 text-right w-36">Crédito</th>
                          <th className="p-4 text-right w-36">Balance Acum.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledgerData.movements.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-500">No se encontraron movimientos en el rango seleccionado.</td>
                          </tr>
                        ) : (
                          ledgerData.movements.map((mov: any) => (
                            <tr key={mov.id} className="hover:bg-slate-50/50">
                              <td className="p-4 font-mono text-xs">{new Date(mov.date).toLocaleDateString('es-DO')}</td>
                              <td className="p-4 font-semibold text-slate-800">{mov.description}</td>
                              <td className="p-4 font-mono text-xs text-slate-500">{mov.reference || '-'}</td>
                              <td className="p-4 text-right font-mono text-slate-700">{mov.debit > 0 ? fmt(mov.debit) : ''}</td>
                              <td className="p-4 text-right font-mono text-slate-700">{mov.credit > 0 ? fmt(mov.credit) : ''}</td>
                              <td className="p-4 text-right font-mono font-bold text-[#003366]">{fmt(mov.balance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TRIAL BALANCE TAB */}
          {activeTab === 'trial-balance' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Desde</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Hasta</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#003366] text-white text-xs uppercase tracking-wider font-semibold">
                          <th className="p-4 w-36">Código</th>
                          <th className="p-4">Nombre de la Cuenta</th>
                          <th className="p-4 text-right w-36">Saldo Inicial</th>
                          <th className="p-4 text-right w-36">Débito</th>
                          <th className="p-4 text-right w-36">Crédito</th>
                          <th className="p-4 text-right w-36">Saldo Final</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trialBalanceData.map((row) => (
                          <tr key={row.id} className={clsx("hover:bg-slate-50/50", row.level === 1 && "bg-slate-50 font-bold")}>
                            <td className="p-4 font-mono">{row.code}</td>
                            <td className={clsx("p-4", row.level === 2 && "pl-8", row.level === 3 && "pl-12", row.level >= 4 && "pl-16")}>
                              {row.name}
                            </td>
                            <td className="p-4 text-right font-mono">{fmt(row.beginningBalance)}</td>
                            <td className="p-4 text-right font-mono text-emerald-600">{row.debit > 0 ? fmt(row.debit) : '-'}</td>
                            <td className="p-4 text-right font-mono text-rose-600">{row.credit > 0 ? fmt(row.credit) : '-'}</td>
                            <td className="p-4 text-right font-mono font-bold text-[#003366]">{fmt(row.endingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* FINANCIALS TAB */}
          {activeTab === 'financials' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setActiveFinancialTab('income-statement')}
                    className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-all", activeFinancialTab === 'income-statement' ? 'bg-[#003366] text-white shadow' : 'text-slate-600 hover:bg-slate-100')}
                  >
                    Estado de Resultados
                  </button>
                  <button 
                    onClick={() => setActiveFinancialTab('balance-sheet')}
                    className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-all", activeFinancialTab === 'balance-sheet' ? 'bg-[#003366] text-white shadow' : 'text-slate-600 hover:bg-slate-100')}
                  >
                    Balance General
                  </button>
                </div>
                <div className="flex gap-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" />
                </div>
              </div>

              {loading || !financialsData ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : activeFinancialTab === 'income-statement' ? (
                /* Income Statement Render */
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
                  <h3 className="text-lg font-bold text-center text-[#003366] uppercase">Estado de Resultados</h3>
                  <p className="text-center text-xs text-slate-500">Rango: {startDate || '-'} al {endDate || '-'}</p>
                  
                  <div className="space-y-4 max-w-2xl mx-auto divide-y divide-slate-100">
                    <div className="pt-2">
                      <h4 className="font-bold text-slate-800 uppercase text-xs mb-2">Ingresos Operacionales</h4>
                      {financialsData.incomeStatement.rows.filter((r: any) => r.type === 'revenue').map((row: any) => (
                        <div key={row.id} className="flex justify-between py-1 text-sm pl-4">
                          <span>{row.code} - {row.name}</span>
                          <span className="font-mono">{fmt(row.endingBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-800 text-sm">
                        <span>Total Ingresos</span>
                        <span className="font-mono">{fmt(financialsData.incomeStatement.totals.revenues)}</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      <h4 className="font-bold text-slate-800 uppercase text-xs mb-2">Costos y Gastos</h4>
                      {financialsData.incomeStatement.rows.filter((r: any) => r.type === 'expense').map((row: any) => (
                        <div key={row.id} className="flex justify-between py-1 text-sm pl-4">
                          <span>{row.code} - {row.name}</span>
                          <span className="font-mono text-rose-600">{fmt(row.endingBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-800 text-sm">
                        <span>Total Gastos</span>
                        <span className="font-mono text-rose-600">{fmt(financialsData.incomeStatement.totals.expenses)}</span>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-between font-bold text-lg text-emerald-600 border-t-2 border-double border-slate-350">
                      <span>UTILIDAD NETA DEL PERIODO</span>
                      <span className="font-mono">{fmt(financialsData.incomeStatement.totals.netIncome)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Balance Sheet Render */
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
                  <h3 className="text-lg font-bold text-center text-[#003366] uppercase">Balance General</h3>
                  <p className="text-center text-xs text-slate-500">Al: {endDate || new Date().toISOString().split('T')[0]}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {/* Assets Side */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-[#003366] border-b pb-2 uppercase text-sm">Activos</h4>
                      {financialsData.balanceSheet.rows.filter((r: any) => r.type === 'asset').map((row: any) => (
                        <div key={row.id} className={clsx("flex justify-between py-1 text-xs", row.level === 1 && "font-bold border-t pt-2")}>
                          <span className={clsx(row.level === 2 && "pl-4", row.level === 3 && "pl-8", row.level >= 4 && "pl-12")}>{row.name}</span>
                          <span className="font-mono">{fmt(row.endingBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t-2 pt-2 font-bold text-[#003366] text-sm">
                        <span>TOTAL ACTIVOS</span>
                        <span className="font-mono">{fmt(financialsData.balanceSheet.totals.assets)}</span>
                      </div>
                    </div>

                    {/* Liabilities & Equity Side */}
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h4 className="font-bold text-[#003366] border-b pb-2 uppercase text-sm">Pasivos</h4>
                        {financialsData.balanceSheet.rows.filter((r: any) => r.type === 'liability').map((row: any) => (
                          <div key={row.id} className={clsx("flex justify-between py-1 text-xs", row.level === 1 && "font-bold border-t pt-2")}>
                            <span className={clsx(row.level === 2 && "pl-4", row.level === 3 && "pl-8", row.level >= 4 && "pl-12")}>{row.name}</span>
                            <span className="font-mono">{fmt(row.endingBalance)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t-2 pt-2 font-bold text-slate-800 text-xs">
                          <span>Total Pasivos</span>
                          <span className="font-mono">{fmt(financialsData.balanceSheet.totals.liabilities)}</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-[#003366] border-b pb-2 uppercase text-sm">Capital / Patrimonio</h4>
                        {financialsData.balanceSheet.rows.filter((r: any) => r.type === 'equity').map((row: any) => (
                          <div key={row.id} className={clsx("flex justify-between py-1 text-xs", row.level === 1 && "font-bold border-t pt-2")}>
                            <span className={clsx(row.level === 2 && "pl-4", row.level === 3 && "pl-8", row.level >= 4 && "pl-12")}>{row.name}</span>
                            <span className="font-mono">{fmt(row.endingBalance)}</span>
                          </div>
                        ))}
                        {/* Net Income from Income Statement needs to be integrated into Equity */}
                        <div className="flex justify-between py-1 text-xs text-emerald-600 font-semibold italic">
                          <span className="pl-4">Utilidad del Periodo Actual</span>
                          <span className="font-mono">{fmt(financialsData.balanceSheet.totals.netIncome)}</span>
                        </div>
                        <div className="flex justify-between border-t-2 pt-2 font-bold text-slate-800 text-xs">
                          <span>Total Capital</span>
                          <span className="font-mono">{fmt(financialsData.balanceSheet.totals.equity + financialsData.balanceSheet.totals.netIncome)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between border-t-2 border-double pt-4 font-bold text-[#003366] text-sm">
                        <span>TOTAL PASIVO Y CAPITAL</span>
                        <span className="font-mono">{fmt(financialsData.balanceSheet.totals.liabilities + financialsData.balanceSheet.totals.equity + financialsData.balanceSheet.totals.netIncome)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* PERIODS TAB */}
          {activeTab === 'periods' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-[#003366]">Períodos Contables</h3>
                <button 
                  onClick={() => setShowPeriodModal(true)}
                  className="bg-[#003366] text-white font-bold py-2 px-4 rounded-lg flex items-center gap-1 hover:bg-[#002244]"
                >
                  <Plus className="w-4 h-4" /> Abrir Período
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                        <th className="p-4">Nombre Período</th>
                        <th className="p-4">Fecha Inicio</th>
                        <th className="p-4">Fecha Cierre</th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periods.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">No hay períodos fiscales abiertos.</td>
                        </tr>
                      ) : (
                        periods.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="p-4 font-bold text-slate-800">{p.name}</td>
                            <td className="p-4 font-mono text-xs">{new Date(p.startDate).toLocaleDateString('es-DO')}</td>
                            <td className="p-4 font-mono text-xs">{new Date(p.endDate).toLocaleDateString('es-DO')}</td>
                            <td className="p-4 text-center">
                              <span className={clsx(
                                "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                p.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                              )}>
                                {p.status === 'open' ? 'Abierto' : 'Cerrado'}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => handleTogglePeriodStatus(p.id, p.status)}
                                className={clsx(
                                  "text-xs font-bold py-1 px-3 rounded-lg border transition-colors",
                                  p.status === 'open' ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-green-200 text-green-600 hover:bg-green-50'
                                )}
                              >
                                {p.status === 'open' ? 'Cerrar Período' : 'Reabrir Período'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* MAPPINGS TAB */}
          {activeTab === 'mappings' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#003366]">Parametrización de Cuentas Puente (Plantillas)</h3>
                <p className="text-xs text-slate-500 mt-1">Configura las cuentas por defecto que recibirán débitos/créditos de transacciones automatizadas en facturas, cobros y almacén.</p>
              </div>

              {loading ? (
                <div className="flex justify-center p-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { key: 'sales_revenue', label: 'Ingresos por Ventas' },
                      { key: 'accounts_receivable', label: 'Cuentas por Cobrar (Clientes)' },
                      { key: 'cash', label: 'Caja General' },
                      { key: 'bank', label: 'Bancos' },
                      { key: 'itbis_sales', label: 'ITBIS Cobrado en Ventas' },
                      { key: 'itbis_purchases', label: 'ITBIS Pagado en Compras' },
                      { key: 'cost_of_goods_sold', label: 'Costo de Ventas' },
                      { key: 'inventory', label: 'Inventario' },
                      { key: 'supplier_payable', label: 'Cuentas por Pagar (Proveedores)' }
                    ].map((mapItem) => {
                      const activeMapping = mappings.find(m => m.mappingKey === mapItem.key);
                      return (
                        <div key={mapItem.key} className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700 uppercase">{mapItem.label}</label>
                          <select 
                            value={activeMapping?.accountId || ''} 
                            onChange={e => handleUpdateMapping(mapItem.key, e.target.value)}
                            disabled={mappingSubmitting}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:border-[#c5a059] outline-none"
                          >
                            <option value="" disabled>-- Seleccione cuenta puente --</option>
                            {accounts.filter(acc => acc.isTransactional).map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                  <input type="text" required value={accForm.code} onChange={e => setAccForm({ ...accForm, code: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. 1.1.01" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Nombre de Cuenta</label>
                  <input type="text" required value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Efectivo en Caja y Banco" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Tipo de Cuenta</label>
                  <select required value={accForm.type} onChange={e => setAccForm({ ...accForm, type: e.target.value as AccountType })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors">
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
                    <input type="date" required value={journalForm.date} onChange={e => setJournalForm({ ...journalForm, date: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-primary block mb-1">Referencia</label>
                    <input type="text" value={journalForm.reference} onChange={e => setJournalForm({ ...journalForm, reference: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors font-mono" placeholder="Ej. CHK-1024" />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-sm font-semibold text-primary block mb-1">Concepto / Descripción</label>
                    <input type="text" required value={journalForm.description} onChange={e => setJournalForm({ ...journalForm, description: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Registro de..." />
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
