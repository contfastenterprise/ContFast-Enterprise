'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Wallet, Plus, Minus, Scale, History, Lock, RefreshCw,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, ChevronRight,
  Download, Filter, Printer, Eye, Search, ClipboardList, X, Loader2, ShoppingCart
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ThermalTicketPrint } from '@/components/print/ThermalTicketPrint';

// ─── Types ────────────────────────────────────────────────────────────────────
type CashView = 'loading' | 'apertura' | 'gestion' | 'arqueo' | 'historico';

interface Session {
  id: string;
  status: string;
  initialBalance: string;
  expectedBalance: string;
  cashRegisterId: string;
  createdAt: string;
}

interface Movement {
  id: string;
  type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
  amount: string;
  description?: string;
  reference?: string;
  createdAt: string;
}

interface Register {
  id: string;
  name: string;
  code: string;
}

interface HistorySession {
  id: string;
  status: string;
  initialBalance: string;
  expectedBalance: string;
  actualBalance: string | null;
  difference: string | null;
  createdAt: string;
  closedAt: string | null;
  userId: string;
  registerName: string | null;
}

// ─── Currency formatter ────────────────────────────────────────────────────────
const fmt = (val: number | string) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(typeof val === 'string' ? parseFloat(val) : val);

// ─── Denomination data ─────────────────────────────────────────────────────────
const DENOMINATIONS = [
  { value: 2000, color: 'bg-blue-100 border-blue-200 text-blue-800', label: 'RD$ 2,000' },
  { value: 1000, color: 'bg-red-100 border-red-200 text-red-800', label: 'RD$ 1,000' },
  { value: 500, color: 'bg-green-100 border-green-200 text-green-800', label: 'RD$ 500' },
  { value: 200, color: 'bg-orange-100 border-orange-200 text-orange-800', label: 'RD$ 200' },
  { value: 100, color: 'bg-amber-100 border-amber-200 text-amber-800', label: 'RD$ 100' },
  { value: 50, color: 'bg-purple-100 border-purple-200 text-purple-800', label: 'RD$ 50' },
];

// ─── Movement type display helpers ────────────────────────────────────────────
const movType = (type: string) => ({
  sale: { label: 'Venta', colorClass: 'text-blue-700' },
  refund: { label: 'Devolución', colorClass: 'text-amber-700' },
  cash_in: { label: 'Entrada', colorClass: 'text-green-700' },
  cash_out: { label: 'Salida', colorClass: 'text-red-700' },
}[type] ?? { label: type, colorClass: 'text-on-surface-variant/80' });

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CashPage() {
  const router = useRouter();
  const [view, setView] = useState<CashView>('loading');

  // Data
  const [session, setSession] = useState<Session | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [history, setHistory] = useState<HistorySession[]>([]);

  // Apertura form
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New POS register modal
  const [showNewRegisterModal, setShowNewRegisterModal] = useState(false);
  const [newRegisterForm, setNewRegisterForm] = useState({ name: '', code: '' });
  const [creatingRegister, setCreatingRegister] = useState(false);

  // Movement modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveType, setMoveType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveDescription, setMoveDescription] = useState('');

  // Arqueo state
  const [denomQty, setDenomQty] = useState<Record<number, number>>({});
  const [coinsTotal, setCoinsTotal] = useState('');
  const [closeObservations, setCloseObservations] = useState('');
  const [closing, setClosing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // History View Modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);

  // History filters
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histStatus, setHistStatus] = useState('');

  // ─── Loaders ──────────────────────────────────────────────────────────────
  const loadCashData = useCallback(async () => {
    setView('loading');
    try {
      const [sessRes, regRes] = await Promise.all([
        fetch('/api/v1/cash/sessions/active'),
        fetch('/api/v1/cash/registers'),
      ]);

      const sessData = await sessRes.json();
      const regData = await regRes.json();

      if (regData.success) {
        setRegisters(regData.data || []);
        if (regData.data?.length > 0) setSelectedRegisterId(regData.data[0].id);
      }

      if (sessData.success && sessData.data) {
        setSession(sessData.data);
        // Load movements
        const movRes = await fetch(`/api/v1/cash/sessions/${sessData.data.id}/movements`);
        const movData = await movRes.json();
        if (movData.success) setMovements(movData.data || []);
        setView('gestion');
      } else {
        setSession(null);
        setView('apertura');
      }
    } catch (error) {
      console.error('Failed to load cash data:', error);
      toast.error('Error al cargar datos de caja.');
      setView('apertura');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/cash/sessions');
      const data = await res.json();
      if (data.success) setHistory(data.data || []);
    } catch {
      toast.error('Error al cargar historial.');
    }
  }, []);

  useEffect(() => {
    loadCashData();
  }, [loadCashData]);

  const refreshMovements = useCallback(async () => {
    if (!session) return;
    try {
      const movRes = await fetch(`/api/v1/cash/sessions/${session.id}/movements`);
      const movData = await movRes.json();
      if (movData.success) setMovements(movData.data || []);
      // Also refresh session expected balance
      const sessRes = await fetch('/api/v1/cash/sessions/active');
      const sessData = await sessRes.json();
      if (sessData.success && sessData.data) setSession(sessData.data);
    } catch {
      toast.error('Error al actualizar movimientos.');
    }
  }, [session]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCreateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegisterForm.name || !newRegisterForm.code) {
      toast.error('Por favor, complete todos los campos de la terminal.');
      return;
    }
    setCreatingRegister(true);
    try {
      const res = await fetch('/api/v1/cash/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRegisterForm),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Terminal de punto de venta creada exitosamente.');
        setShowNewRegisterModal(false);
        setNewRegisterForm({ name: '', code: '' });
        
        // Reload registers and auto-select
        const regRes = await fetch('/api/v1/cash/registers');
        const regData = await regRes.json();
        if (regData.success) {
          setRegisters(regData.data || []);
          if (data.data?.id) setSelectedRegisterId(data.data.id);
        }
      } else {
        toast.error(data.error?.message || 'Error al crear la terminal');
      }
    } catch {
      toast.error('Error de red al crear la terminal');
    } finally {
      setCreatingRegister(false);
    }
  };

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterId || !initialBalance) {
      toast.error('Complete todos los campos de apertura.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/cash/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashRegisterId: selectedRegisterId,
          initialBalance: parseFloat(initialBalance),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al abrir sesión.');
      toast.success('¡Caja abierta exitosamente!');
      await loadCashData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !moveAmount || !moveDescription) {
      toast.error('Complete todos los campos.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/cash/sessions/${session.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: moveType,
          amount: parseFloat(moveAmount),
          description: moveDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al registrar movimiento.');
      toast.success('Movimiento registrado.');
      setShowMoveModal(false);
      setMoveAmount('');
      setMoveDescription('');
      await refreshMovements();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Arqueo calculations ─────────────────────────────────────────────────
  const getCashTotal = () => {
    let total = 0;
    for (const denom of DENOMINATIONS) {
      total += (denomQty[denom.value] || 0) * denom.value;
    }
    total += parseFloat(coinsTotal || '0');
    return total;
  };

  const getExpectedBalance = () => parseFloat(session?.expectedBalance || '0');
  const getRealBalance = () => getCashTotal();
  const getDifference = () => getRealBalance() - getExpectedBalance();

  const handleCloseSession = async () => {
    if (!session) return;
    const real = getRealBalance();
    const expected = getExpectedBalance();
    const diff = real - expected;

    setClosing(true);
    try {
      const res = await fetch(`/api/v1/cash/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualBalance: real,
          justification: closeObservations || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al cerrar sesión.');
      setClosedSessionId(session.id);
      setShowSuccessModal(true);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setClosing(false);
    }
  };

  const handleSuccessClose = async () => {
    setShowSuccessModal(false);
    setClosedSessionId(null);
    setDenomQty({});
    setCoinsTotal('');
    setCloseObservations('');
    await loadCashData();
  };

  const handleExportHistory = () => {
    if (history.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const headers = ['Terminal', 'Usuario', 'Apertura', 'Cierre', 'Fondo Inicial', 'Saldo Esperado', 'Saldo Real', 'Diferencia', 'Estado'];
    const csvContent = [
      headers.join(','),
      ...history.map(h => [
        h.registerName,
        h.userId,
        new Date(h.createdAt).toLocaleString('es-DO'),
        h.closedAt ? new Date(h.closedAt).toLocaleString('es-DO') : 'Abierto',
        h.initialBalance || 0,
        h.expectedBalance || 0,
        h.actualBalance || 0,
        h.difference || 0,
        h.status === 'open' ? 'Abierto' : 'Cerrado'
      ].map(v => `"${v}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historico_caja_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Archivo exportado exitosamente');
  };

  const handleTabChange = (newView: CashView) => {
    if (newView === 'historico') loadHistory();
    setView(newView);
  };

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] max-w-7xl mx-auto w-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <RefreshCw className="w-8 h-8 text-blue-900" />
        </motion.div>
      </div>

    );
  }

  // ─── APERTURA VIEW (modal overlay) ────────────────────────────────────────
  if (view === 'apertura') {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);

    return (
      <div className="relative min-h-[calc(100vh-160px)] flex items-center justify-center bg-gray-50">
        {/* Blurred background suggestion */}
        <div className="absolute inset-0 opacity-5 pointer-events-none grid grid-cols-3 gap-6 p-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-300 h-40" />
          ))}
        </div>

        {/* Apertura Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative w-full max-w-2xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden z-10"
        >
          {/* Modal Header */}
          <div className="bg-[#001733] border-b border-[#003366] px-8 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-display font-bold text-white mb-1 tracking-tight">
                Apertura de Turno de Caja
              </h2>
              <p className="text-xs text-[#c5a059]/80">
                Inicie su jornada laboral validando los datos de la terminal.
              </p>
            </div>
            <div className="bg-[#003366]/50 border border-[#003366] p-3 rounded-xl">
              <Wallet className="w-10 h-10 text-[#c5a059]" />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleOpenSession} className="p-8 space-y-6">
            {/* Terminal + Date row */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-primary flex items-center gap-1">
                    Punto de Venta / Terminal <span className="text-[#c5a059]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewRegisterModal(true)}
                    className="text-xs font-bold text-[#c5a059] hover:underline"
                  >
                    + Nueva Terminal
                  </button>
                </div>
                <select
                  value={selectedRegisterId}
                  onChange={(e) => setSelectedRegisterId(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-3 text-primary focus:border-[#c5a059] outline-none transition-colors"
                  required
                >
                  {registers.length === 0 && (
                    <option value="">Sin terminales configuradas</option>
                  )}
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary">
                  Fecha de Apertura
                </label>
                <input
                  type="date"
                  defaultValue={dateStr}
                  readOnly
                  className="w-full bg-surface-container-highest border border-outline/50 rounded-lg px-4 py-3 text-on-surface-variant font-mono cursor-not-allowed opacity-70"
                />
              </div>
            </div>

            {/* Time row */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary">
                  Hora de Inicio
                </label>
                <input
                  type="time"
                  defaultValue={timeStr}
                  readOnly
                  className="w-full bg-surface-container-highest border border-outline/50 rounded-lg px-4 py-3 text-on-surface-variant font-mono cursor-not-allowed opacity-70"
                />
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-2 text-[#c5a059] text-sm font-semibold bg-[#001733] border border-[#003366] px-4 py-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  Conexión segura activa
                </div>
              </div>
            </div>

            {/* Opening Balance */}
            <div className="space-y-1 pt-2">
              <label className="text-sm font-semibold text-primary flex items-center gap-1">
                Monto de Apertura (Fondo de Caja) <span className="text-[#c5a059]">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-lg">
                  RD$
                </div>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-[#001733] border border-[#003366] rounded-xl pl-14 pr-4 py-4 text-white font-mono text-2xl font-bold focus:border-[#c5a059] outline-none transition-colors"
                  required
                />
              </div>
              <p className="text-xs text-[#c5a059]/80 pl-1 mt-1">
                Sugerencia: Monto base operativo (RD$ 5,000.00)
              </p>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-4 pt-6 border-t border-[#003366]">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-3 px-5 text-on-surface-variant hover:text-primary font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || registers.length === 0}
                className={clsx(
                  'flex-[2] py-3 bg-[#c5a059] text-[#001e40] font-bold text-base rounded-xl flex items-center justify-center gap-3 transition-colors hover:bg-[#d4b069]',
                  (submitting || registers.length === 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {submitting ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <RefreshCw className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Lock className="w-5 h-5" />
                )}
                {submitting ? 'Procesando...' : 'Abrir Caja'}
              </button>
            </div>
          </form>

          {/* Status bar */}
          <div className="bg-gray-50 border-t border-gray-100 px-8 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">
              Esperando autorización de terminal...
            </p>
          </div>
        </motion.div>

        {/* ── New POS Terminal Modal ────────────────────────────────────── */}
        <AnimatePresence>
          {showNewRegisterModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="text-base font-bold text-gray-800">Nueva Terminal de Caja</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Configure una nueva terminal para su empresa.</p>
                  </div>
                  <button onClick={() => setShowNewRegisterModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateRegister} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 block">Nombre de la Terminal <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={newRegisterForm.name}
                      onChange={e => setNewRegisterForm({ ...newRegisterForm, name: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 text-sm focus:border-gray-400 focus:ring-2 focus:ring-gray-200 outline-none transition-colors"
                      placeholder="Ej. Caja Principal, Terminal 1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 block">Código Único <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={newRegisterForm.code}
                      onChange={e => setNewRegisterForm({ ...newRegisterForm, code: e.target.value.toUpperCase() })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 text-sm focus:border-gray-400 focus:ring-2 focus:ring-gray-200 outline-none transition-colors font-mono uppercase"
                      placeholder="Ej. CAJA-01"
                    />
                    <p className="text-[11px] text-gray-400">Identificador único interno para esta terminal.</p>
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowNewRegisterModal(false)}
                      className="px-5 py-2 text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creatingRegister}
                      className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      {creatingRegister ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Crear Terminal
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── SESSION ACTIVE: Tab navigation ──────────────────────────────────────
  const tabs: { id: CashView; label: string; icon: React.ReactNode }[] = [
    { id: 'gestion', label: 'Gestión de Caja', icon: <Wallet className="w-4 h-4" /> },
    { id: 'arqueo', label: 'Arqueo y Cierre', icon: <Scale className="w-4 h-4" /> },
    { id: 'historico', label: 'Histórico de Cierres', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-0">
      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-6 pt-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all rounded-t-lg',
              view === tab.id
                ? 'border-[#775a19] text-[#775a19] bg-amber-50'
                : 'border-transparent text-on-surface-variant/70 hover:text-slate-700 hover:bg-gray-50'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── GESTIÓN VIEW ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {view === 'gestion' && (
          <motion.div
            key="gestion"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-6 space-y-6"
          >
            {/* Header */}
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold text-[#001e40] tracking-tight">Gestión de Caja</h1>
                <p className="text-sm text-on-surface-variant/70 flex items-center gap-2 mt-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  Turno en curso — iniciado{' '}
                  {session ? new Date(session.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setMoveType('cash_in'); setShowMoveModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-[#001e40] text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Entrada de Efectivo
                </button>
                <button
                  onClick={() => { setMoveType('cash_out'); setShowMoveModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-[#001e40] text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                  Salida de Efectivo
                </button>
                <button
                  onClick={() => handleTabChange('arqueo')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#c5a059] text-[#001e40] text-xs font-bold rounded-lg hover:bg-[#d4b069] transition-all shadow-sm"
                >
                  <Scale className="w-4 h-4" />
                  Arqueo y Cierre
                </button>
              </div>
            </div>

            {/* Bento grid: Balance + Métodos de pago */}
            <div className="grid grid-cols-12 gap-4">
              {/* Balance card */}
              <div className="col-span-12 md:col-span-4 bg-white rounded-xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant/70 uppercase tracking-widest mb-2">Balance Actual</p>
                  <p className="text-4xl font-black text-[#001e40] tracking-tight">
                    {fmt(session?.expectedBalance || '0')}
                  </p>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Fondo Inicial</p>
                    <p className="font-mono text-sm text-slate-700">{fmt(session?.initialBalance || '0')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Transacciones</p>
                    <p className="font-mono text-sm text-slate-700">{movements.length}</p>
                  </div>
                </div>
              </div>

              {/* Payment method cards */}
              <div className="col-span-12 md:col-span-8 grid grid-cols-3 gap-4">
                {[
                  {
                    icon: <Wallet className="w-5 h-5 text-amber-700" />,
                    label: 'EFECTIVO',
                    color: 'bg-amber-50',
                    amount: movements.filter(m => !m.reference?.includes('card')).reduce((s, m) =>
                      s + (m.type === 'sale' || m.type === 'cash_in' ? parseFloat(m.amount) : -parseFloat(m.amount)), 0),
                    count: movements.filter(m => m.type === 'sale' || m.type === 'cash_in').length,
                  },
                  {
                    icon: <ClipboardList className="w-5 h-5 text-blue-700" />,
                    label: 'TARJETA',
                    color: 'bg-blue-50',
                    amount: 0,
                    count: 0,
                  },
                  {
                    icon: <TrendingUp className="w-5 h-5 text-on-surface-variant/80" />,
                    label: 'OTROS',
                    color: 'bg-slate-50',
                    amount: 0,
                    count: 0,
                  },
                ].map((card) => (
                  <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div className={clsx('p-2 rounded-lg', card.color)}>{card.icon}</div>
                      <span className={clsx('text-[10px] px-2 py-0.5 rounded font-bold', card.color, 'text-on-surface-variant/80')}>
                        {card.label}
                      </span>
                    </div>
                    <div className="mt-auto">
                      <p className="text-lg font-bold text-[#001e40]">{fmt(card.amount)}</p>
                      <p className="text-xs text-on-surface-variant">{card.count} Transacciones</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Movements table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="text-lg font-bold text-[#001e40]">Movimientos de Caja</h3>
                <div className="flex gap-2">
                  <button
                    onClick={refreshMovements}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Actualizar"
                  >
                    <RefreshCw className="w-4 h-4 text-on-surface-variant/70" />
                  </button>
                  <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Exportar">
                    <Download className="w-4 h-4 text-on-surface-variant/70" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
                      <th className="px-6 py-3 border-b border-gray-100">Hora</th>
                      <th className="px-6 py-3 border-b border-gray-100">Tipo</th>
                      <th className="px-6 py-3 border-b border-gray-100">Concepto</th>
                      <th className="px-6 py-3 border-b border-gray-100 text-right">Monto</th>
                      <th className="px-6 py-3 border-b border-gray-100 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant">
                          No hay movimientos registrados en este turno.
                        </td>
                      </tr>
                    ) : (
                      movements.map((mv) => {
                        const { label, colorClass } = movType(mv.type);
                        const isPositive = mv.type === 'sale' || mv.type === 'cash_in';
                        return (
                          <tr key={mv.id} className="hover:bg-amber-50/30 transition-colors border-b border-gray-50">
                            <td className="px-6 py-4 font-mono text-xs text-on-surface-variant/70">
                              {new Date(mv.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className={clsx('px-6 py-4 font-bold', colorClass)}>{label}</td>
                            <td className="px-6 py-4 text-slate-700">{mv.description || mv.reference || '—'}</td>
                            <td className={clsx('px-6 py-4 text-right font-mono font-bold', isPositive ? 'text-emerald-700' : 'text-red-700')}>
                              {isPositive ? '' : '−'}{fmt(mv.amount)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full uppercase">
                                Registrado
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {movements.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 font-bold text-[#001e40]">
                        <td className="px-6 py-4 text-right text-xs uppercase tracking-widest text-on-surface-variant" colSpan={3}>
                          Total Neto en Caja
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-lg">
                          {fmt(session?.expectedBalance || '0')}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Security reminder */}
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-4 items-start">
              <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-blue-800">Recordatorio de Seguridad</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  El arqueo de caja debe realizarse al finalizar cada turno. Cuente el efectivo físico antes de proceder con el cierre digital.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── ARQUEO VIEW ─────────────────────────────────────────────── */}
        {view === 'arqueo' && (
          <motion.div
            key="arqueo"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-6 space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#001e40] tracking-tight">Arqueo y Cierre de Caja</h1>
                <p className="text-sm text-on-surface-variant/70 mt-1">Realice el conteo físico para finalizar el turno de trabajo.</p>
              </div>
              <div className="bg-gray-100 px-4 py-2 rounded-lg">
                <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-tighter">Fecha y Hora</p>
                <p className="font-mono text-sm font-bold text-[#001e40]">
                  {new Date().toLocaleString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Denomination form */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-[#001e40] flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      Desglose de Efectivo (DOP)
                    </h2>
                    <button
                      onClick={() => { setDenomQty({}); setCoinsTotal(''); }}
                      className="text-xs font-semibold text-amber-700 hover:underline underline-offset-4"
                    >
                      Limpiar Formulario
                    </button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-4 items-center bg-gray-50 px-4 py-2 rounded-lg text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
                    <div className="col-span-5">Denominación</div>
                    <div className="col-span-3 text-center">Cantidad</div>
                    <div className="col-span-4 text-right">Subtotal</div>
                  </div>

                  {/* Denomination rows */}
                  <div className="space-y-1">
                    {DENOMINATIONS.map((d) => {
                      const qty = denomQty[d.value] || 0;
                      const subtotal = qty * d.value;
                      return (
                        <div key={d.value} className="grid grid-cols-12 gap-4 items-center px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <div className="col-span-5 flex items-center gap-3">
                            <div className={clsx('w-12 h-8 rounded border flex items-center justify-center text-[10px] font-bold', d.color)}>
                              RD$
                            </div>
                            <span className="text-sm font-bold text-slate-700">{d.label}</span>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="number"
                              min="0"
                              value={qty || ''}
                              onChange={(e) => setDenomQty(prev => ({
                                ...prev,
                                [d.value]: parseInt(e.target.value) || 0,
                              }))}
                              placeholder="0"
                              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-center font-mono text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all"
                            />
                          </div>
                          <div className="col-span-4 text-right font-mono text-sm font-semibold text-slate-700">
                            {fmt(subtotal)}
                          </div>
                        </div>
                      );
                    })}

                    {/* Coins row */}
                    <div className="grid grid-cols-12 gap-4 items-center px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="col-span-5 flex items-center gap-3">
                        <div className="w-12 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-700">
                          RD$
                        </div>
                        <span className="text-sm font-bold text-slate-700">Total Monedas</span>
                      </div>
                      <div className="col-span-7">
                        <input
                          type="number"
                          min="0"
                          value={coinsTotal}
                          onChange={(e) => setCoinsTotal(e.target.value)}
                          placeholder="Ingrese monto total en monedas"
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-right font-mono text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Observations */}
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
                      Observaciones del Cierre
                    </label>
                    <textarea
                      value={closeObservations}
                      onChange={(e) => setCloseObservations(e.target.value)}
                      placeholder="Escriba cualquier novedad o discrepancia detectada..."
                      rows={3}
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Right: Summary + Actions */}
              <div className="lg:col-span-5 space-y-4">
                {/* Audit summary card */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                    <Wallet className="w-20 h-20 text-[#001e40]" />
                  </div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-[#001e40]">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                    Resumen de Auditoría
                  </h2>
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs text-on-surface-variant/70 uppercase tracking-widest mb-1">Saldo Esperado en Sistema</p>
                      <p className="text-4xl font-mono font-black tracking-tight text-[#001e40]">{fmt(getExpectedBalance())}</p>
                    </div>
                    <div className="h-px bg-gray-100" />
                    <div>
                      <p className="text-xs text-on-surface-variant/70 uppercase tracking-widest mb-1">Saldo Real (Contado)</p>
                      <p className="text-4xl font-mono font-black tracking-tight text-amber-600">{fmt(getRealBalance())}</p>
                    </div>
                  </div>

                  {/* Difference indicator */}
                  <div className={clsx(
                    'mt-8 p-4 rounded-xl flex items-center justify-between border',
                    getDifference() === 0 ? 'bg-emerald-50 border-emerald-100' :
                      getDifference() > 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'
                  )}>
                    <div>
                      <p className="text-xs uppercase opacity-70 font-semibold text-slate-700">Diferencia</p>
                      <p className="font-mono text-xl font-bold text-slate-800">{fmt(getDifference())}</p>
                    </div>
                    <span className={clsx(
                      'px-3 py-1 rounded-lg text-xs font-bold uppercase',
                      getDifference() === 0 ? 'bg-emerald-100 text-emerald-800' :
                        getDifference() > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    )}>
                      {getDifference() === 0 ? 'Cuadrado' : getDifference() > 0 ? 'Sobrante' : 'Faltante'}
                    </span>
                  </div>
                </div>

                {/* Operations breakdown */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                  <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">Detalle de Operaciones</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Fondo Inicial de Caja', value: session?.initialBalance || '0', color: 'text-slate-700' },
                      {
                        label: 'Entradas / Ventas Efectivo (+)',
                        value: movements.filter(m => m.type === 'sale' || m.type === 'cash_in')
                          .reduce((s, m) => s + parseFloat(m.amount), 0).toString(),
                        color: 'text-emerald-700',
                      },
                      {
                        label: 'Salidas / Gastos (−)',
                        value: movements.filter(m => m.type === 'refund' || m.type === 'cash_out')
                          .reduce((s, m) => s + parseFloat(m.amount), 0).toString(),
                        color: 'text-red-700',
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between items-center text-sm">
                        <span className="text-on-surface-variant/70">{row.label}</span>
                        <span className={clsx('font-mono font-semibold', row.color)}>{fmt(row.value)}</span>
                      </div>
                    ))}
                    <div className="h-px bg-gray-100 my-1" />
                    <div className="flex justify-between items-center font-bold text-sm">
                      <span>Total Esperado</span>
                      <span className="font-mono">{fmt(getExpectedBalance())}</span>
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <div className="space-y-3">
                  <button
                    onClick={handleCloseSession}
                    disabled={closing}
                    className={clsx(
                      'w-full bg-[#775a19] text-primary font-bold text-base py-5 rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all',
                      closing ? 'opacity-70 cursor-not-allowed' : 'hover:brightness-110 active:scale-[0.98]'
                    )}
                  >
                    {closing ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <RefreshCw className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <Printer className="w-5 h-5" />
                    )}
                    {closing ? 'Cerrando turno...' : 'Finalizar Turno e Imprimir Arqueo'}
                  </button>
                  <p className="text-center text-xs text-on-surface-variant italic">
                    * Al confirmar, se cerrará la sesión de la terminal y se generará el reporte de cierre.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── HISTÓRICO VIEW ───────────────────────────────────────────── */}
        {view === 'historico' && (
          <motion.div
            key="historico"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-6 space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <nav className="flex items-center gap-2 text-xs text-on-surface-variant mb-2">
                  <span>Caja</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="font-bold text-slate-700">Histórico de Cierres</span>
                </nav>
                <h1 className="text-3xl font-bold text-[#001e40] tracking-tight">Histórico de Cierres de Caja</h1>
                <p className="text-sm text-on-surface-variant/70 mt-1">Consulta y audita los turnos de facturación finalizados.</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleExportHistory} className="bg-gray-100 text-on-surface-variant/80 text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 border border-gray-200 hover:bg-gray-200 transition-colors">
                  <Download className="w-4 h-4" />
                  EXPORTAR XLS
                </button>
                <button
                  onClick={loadHistory}
                  className="bg-[#001e40] text-primary text-xs font-semibold px-5 py-2 rounded-lg flex items-center gap-2 hover:bg-[#003366] transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  ACTUALIZAR
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Desde Fecha</label>
                  <input
                    type="date"
                    value={histDateFrom}
                    onChange={(e) => setHistDateFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Estado del Cierre</label>
                  <select
                    value={histStatus}
                    onChange={(e) => setHistStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none"
                  >
                    <option value="">Todos los estados</option>
                    <option value="closed">Cerrado</option>
                    <option value="open">Abierto</option>
                  </select>
                </div>
                <div className="md:col-start-4 flex items-center gap-2">
                  <button
                    onClick={() => { setHistDateFrom(''); setHistStatus(''); }}
                    className="flex-1 bg-gray-50 text-on-surface-variant/80 text-xs font-semibold py-2.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    LIMPIAR
                  </button>
                  <button
                    onClick={loadHistory}
                    className="flex-[2] bg-[#001e40]/10 text-[#001e40] text-xs font-semibold py-2.5 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
                  >
                    <Filter className="w-3 h-3" />
                    APLICAR FILTROS
                  </button>
                </div>
              </div>
            </div>

            {/* History table */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Apertura', 'Cierre', 'Terminal', 'Esperado (RD$)', 'Real (RD$)', 'Diferencia', 'Acciones'].map(col => (
                        <th key={col} className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-widest text-left">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant">
                          No hay registros de cierres de caja.
                        </td>
                      </tr>
                    ) : (
                      history
                        .filter((s) => {
                          if (histStatus && s.status !== histStatus) return false;
                          if (histDateFrom && new Date(s.createdAt) < new Date(histDateFrom)) return false;
                          return true;
                        })
                        .map((s) => {
                          const diff = s.difference ? parseFloat(s.difference) : null;
                          return (
                            <tr key={s.id} className="hover:bg-amber-50/30 transition-colors group">
                              <td className="px-6 py-4">
                                <p className="font-mono text-xs text-slate-700">
                                  {new Date(s.createdAt).toLocaleDateString('es-DO')}
                                </p>
                                <p className="text-[11px] text-on-surface-variant">
                                  {new Date(s.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                {s.closedAt ? (
                                  <>
                                    <p className="font-mono text-xs text-slate-700">
                                      {new Date(s.closedAt).toLocaleDateString('es-DO')}
                                    </p>
                                    <p className="text-[11px] text-on-surface-variant">
                                      {new Date(s.closedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                                    ACTIVO
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-xs font-semibold text-[#001e40]">
                                {s.registerName || '—'}
                              </td>
                              <td className="px-6 py-4 font-mono text-right">
                                {fmt(s.expectedBalance || '0')}
                              </td>
                              <td className="px-6 py-4 font-mono text-right">
                                {s.actualBalance ? fmt(s.actualBalance) : '—'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {diff !== null ? (
                                  <span className={clsx(
                                    'text-[11px] px-2 py-0.5 rounded-full font-bold',
                                    diff === 0 ? 'bg-emerald-100 text-emerald-800' :
                                      diff > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                                  )}>
                                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-center gap-1">
                                  <button onClick={() => { setSelectedSession(s); setShowViewModal(true); }} className="p-2 text-on-surface-variant hover:text-blue-600 transition-colors rounded" title="Ver Detalle">
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setClosedSessionId(null);
                                      setTimeout(() => setClosedSessionId(s.id), 50);
                                      toast.success('Generando impresión...');
                                    }} 
                                    className="p-2 text-on-surface-variant hover:text-amber-600 transition-colors rounded" 
                                    title="Reimprimir"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                  {history.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase text-right" colSpan={3}>
                          Totales del Periodo
                        </td>
                        <td className="px-6 py-4 font-mono text-right font-bold text-[#001e40]">
                          {fmt(history.reduce((s, h) => s + parseFloat(h.expectedBalance || '0'), 0))}
                        </td>
                        <td className="px-6 py-4 font-mono text-right font-bold text-[#001e40]">
                          {fmt(history.reduce((s, h) => s + parseFloat(h.actualBalance || '0'), 0))}
                        </td>
                        <td className="px-6 py-4 font-mono text-right font-bold text-red-700">
                          {fmt(history.reduce((s, h) => s + parseFloat(h.difference || '0'), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Pagination placeholder */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">
                  Mostrando {Math.min(history.length, 100)} de {history.length} registros
                </span>
              </div>
            </div>

            {/* KPI Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: <TrendingUp className="w-6 h-6 text-amber-700" />,
                  bg: 'bg-amber-50',
                  label: 'Promedio Diario',
                  value: fmt(history.length > 0 ? history.reduce((s, h) => s + parseFloat(h.expectedBalance || '0'), 0) / history.length : 0),
                },
                {
                  icon: <CheckCircle2 className="w-6 h-6 text-blue-700" />,
                  bg: 'bg-blue-50',
                  label: 'Cierres Cuadrados',
                  value: `${history.filter(h => parseFloat(h.difference || '0') === 0).length} / ${history.length}`,
                },
                {
                  icon: <AlertTriangle className="w-6 h-6 text-red-700" />,
                  bg: 'bg-red-50',
                  label: 'Diferencias Totales',
                  value: fmt(history.reduce((s, h) => s + parseFloat(h.difference || '0'), 0)),
                },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm flex items-center gap-4">
                  <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center', kpi.bg)}>
                    {kpi.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-on-surface-variant">{kpi.label}</p>
                    <p className="text-lg font-bold text-[#001e40]">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Movement modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMoveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  {moveType === 'cash_in'
                    ? <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Plus className="w-4 h-4 text-emerald-600" /></div>
                    : <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><Minus className="w-4 h-4 text-red-600" /></div>
                  }
                  <h3 className="text-base font-bold text-gray-800">
                    {moveType === 'cash_in' ? 'Entrada de Efectivo' : 'Salida de Efectivo'}
                  </h3>
                </div>
                <button onClick={() => setShowMoveModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddMovement} className="p-6 space-y-5">
                <div className="flex gap-3">
                  {(['cash_in', 'cash_out'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMoveType(t)}
                      className={clsx(
                        'flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all',
                        moveType === t
                          ? t === 'cash_in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
                      )}
                    >
                      {t === 'cash_in' ? '↑ Entrada' : '↓ Salida'}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Monto (RD$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">RD$</span>
                    <input
                      type="number"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-14 pr-4 py-3 font-mono text-xl font-bold text-gray-800 focus:border-[#001e40] focus:ring-2 focus:ring-[#001e40]/10 outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block mb-1">Descripción / Concepto</label>
                  <input
                    type="text"
                    value={moveDescription}
                    onChange={(e) => setMoveDescription(e.target.value)}
                    placeholder="Ej: Pago de mensajería, fondo adicional..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:border-[#001e40] focus:ring-2 focus:ring-[#001e40]/10 outline-none transition-colors"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowMoveModal(false)}
                    className="px-5 py-2.5 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={clsx(
                      'flex items-center justify-center gap-2 px-6 py-2.5 font-bold rounded-lg transition-colors text-white',
                      moveType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
                      submitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                    Registrar {moveType === 'cash_in' ? 'Entrada' : 'Salida'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success close modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white p-10 rounded-2xl max-w-md w-full shadow-2xl text-center border-t-8 border-amber-500"
            >
              <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-[#001e40] mb-2">Cierre Exitoso</h2>
              <p className="text-on-surface-variant/70 mb-8">
                El arqueo ha sido procesado y el turno ha sido cerrado satisfactoriamente. La terminal está lista para el siguiente turno.
              </p>
              {closedSessionId && (
                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                  <ThermalTicketPrint sessionId={closedSessionId!} autoPrint={true} />
                </div>
              )}
              <button
                onClick={handleSuccessClose}
                className="w-full bg-[#001e40] text-primary py-4 rounded-xl font-bold text-base hover:bg-[#003366] transition-colors"
              >
                Volver al Inicio
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── View Session Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showViewModal && selectedSession && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="bg-[#001e40] p-6 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10">
                  <Wallet className="w-32 h-32 transform translate-x-8 -translate-y-8" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold font-display">Detalle de Turno</h3>
                  <p className="text-sm opacity-80 mt-1">{selectedSession.registerName}</p>
                </div>
                <button onClick={() => setShowViewModal(false)} className="relative z-10 text-white/70 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="block text-gray-500 font-semibold mb-1">Apertura</span>
                    <span className="font-bold">{new Date(selectedSession.createdAt).toLocaleString('es-DO')}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 font-semibold mb-1">Cierre</span>
                    <span className="font-bold">{selectedSession.closedAt ? new Date(selectedSession.closedAt).toLocaleString('es-DO') : 'En curso'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 font-semibold mb-1">Usuario</span>
                    <span className="font-bold">{selectedSession.userId}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 font-semibold mb-1">Estado</span>
                    <span className="font-bold">{selectedSession.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
                  </div>
                </div>
                <div className="h-px bg-gray-200 my-4" />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fondo Inicial</span>
                    <span className="font-mono font-bold">{fmt(selectedSession.initialBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Saldo Esperado</span>
                    <span className="font-mono font-bold text-blue-600">{fmt(selectedSession.expectedBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Saldo Real (Arqueo)</span>
                    <span className="font-mono font-bold text-amber-600">{fmt(selectedSession.actualBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                    <span className="text-gray-800 font-bold">Diferencia</span>
                    <span className={clsx(
                      "font-mono font-bold",
                      (parseFloat(selectedSession.difference || '0') < 0) ? 'text-red-600' : 'text-emerald-600'
                    )}>
                      {fmt(selectedSession.difference || 0)}
                    </span>
                  </div>
                </div>
                {selectedSession.closeObservations && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <span className="block text-xs text-gray-500 font-semibold mb-1 uppercase">Observaciones</span>
                    <p className="text-sm text-gray-700">{selectedSession.closeObservations}</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setClosedSessionId(null);
                    setTimeout(() => setClosedSessionId(selectedSession.id), 50);
                    toast.success('Generando impresión...');
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold text-sm rounded-lg hover:bg-gray-100 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Reimprimir
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-6 py-2 bg-[#001e40] text-white font-bold text-sm rounded-lg hover:bg-[#003366] transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Global Print overlay for Reimprimir ────────────────────────── */}
      {!showSuccessModal && closedSessionId && (
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
          <ThermalTicketPrint sessionId={closedSessionId} autoPrint={true} />
        </div>
      )}

    </div>
  );
}
