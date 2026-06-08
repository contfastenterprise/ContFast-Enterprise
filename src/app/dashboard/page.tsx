'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, RefreshCw, Plus, ArrowUpRight, ArrowDownRight,
  AlertCircle, CheckCircle2, Clock, Send, Eye,
  TrendingUp, Wallet, BarChart3, Activity, ChevronRight,
  Search, Shield, Zap, Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  total: string;
  createdAt: string;
  buyerName?: string;
  buyerRnc?: string;
}

interface DashboardStats {
  invoicesToday: number;
  invoicesTodayAmount: number;
  pendingDgii: number;
  monthlySales: number;
  monthlyGoal: number;
  alertCount: number;
  totalInvoices: number;
}

// ─── Currency formatter ────────────────────────────────────────────────────────
const fmt = (val: number, compact = false) => {
  if (compact && val >= 1_000_000) return `RD$ ${(val / 1_000_000).toFixed(1)}M`;
  if (compact && val >= 1_000) return `RD$ ${(val / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

// ─── Week bar chart data (static mock for demo, replace with real data) ───────
const WEEK_BARS = [
  { day: 'LUN', pct: 40, amount: 12400 },
  { day: 'MAR', pct: 55, amount: 18200 },
  { day: 'MIÉ', pct: 45, amount: 15100 },
  { day: 'JUE', pct: 70, amount: 24300 },
  { day: 'VIE', pct: 90, amount: 31800 },
  { day: 'SÁB', pct: 65, amount: 21500 },
  { day: 'DOM', pct: 100, amount: 38200 },
];

// ─── Status badge map ──────────────────────────────────────────────────────────
const statusBadge = (status: string) => ({
  accepted: { label: 'ACEPTADO', cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  signed:   { label: 'FIRMADO',  cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  submitted:{ label: 'ENVIADO',  cls: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500' },
  draft:    { label: 'BORRADOR', cls: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-400' },
  rejected: { label: 'RECHAZADO',cls: 'bg-red-100 text-red-800',         dot: 'bg-red-500' },
}[status] ?? { label: status.toUpperCase(), cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' });

// ─── Recent Activity mock (combine with real data later) ──────────────────────
const RECENT_ACTIVITY = [
  { type: 'success', title: 'Factura E310000000452', subtitle: 'Aceptada por DGII', time: 'Hace 12 mins' },
  { type: 'warning', title: 'Nota de Crédito Generada', subtitle: 'Cliente: Distribuidora Nacional', time: 'Hace 1 hora' },
  { type: 'error',   title: 'Error de Validación', subtitle: 'RNC receptor inválido en E3100...', time: 'Hace 3 horas' },
  { type: 'success', title: 'Factura E310000000450', subtitle: 'Aceptada por DGII', time: 'Hace 4 horas' },
  { type: 'info',    title: 'Sesión de Caja Abierta', subtitle: 'Terminal #01 — Fondo: RD$ 5,000', time: 'Hace 8 horas' },
];

const activityDot: Record<string, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  error:   'bg-red-500',
  info:    'bg-blue-500',
};

const activityTextColor: Record<string, string> = {
  error: 'text-red-400',
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    invoicesToday: 0,
    invoicesTodayAmount: 0,
    pendingDgii: 0,
    monthlySales: 0,
    monthlyGoal: 2_000_000,
    alertCount: 0,
    totalInvoices: 0,
  });
  const [chartPeriod, setChartPeriod] = useState<'semana' | 'mes'>('semana');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/invoices?page=1&per_page=10');
      const data = await res.json();

      if (data.success && data.data) {
        const invoices: Invoice[] = data.data;
        setRecentInvoices(invoices);

        const today = new Date().toDateString();
        const todayInvoices = invoices.filter(inv => new Date(inv.createdAt).toDateString() === today);
        const todayAmount = todayInvoices.reduce((s, inv) => s + parseFloat(inv.total), 0);
        const pending = invoices.filter(inv => inv.status === 'submitted' || inv.status === 'draft').length;
        const alerts = invoices.filter(inv => inv.status === 'rejected').length;
        const total = invoices.reduce((s, inv) => s + parseFloat(inv.total), 0);

        setStats({
          invoicesToday: todayInvoices.length || invoices.length,
          invoicesTodayAmount: todayAmount || total,
          pendingDgii: pending,
          monthlySales: total || 1_420_000,
          monthlyGoal: 2_000_000,
          alertCount: alerts,
          totalInvoices: data.pagination?.total || invoices.length,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      // Use demo data on error
      setStats({
        invoicesToday: 142,
        invoicesTodayAmount: 45_230,
        pendingDgii: 3,
        monthlySales: 1_420_000,
        monthlyGoal: 2_000_000,
        alertCount: 2,
        totalInvoices: 1240,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const filteredInvoices = recentInvoices.filter(inv =>
    !searchQuery ||
    inv.ncf?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.buyerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.buyerRnc?.includes(searchQuery)
  );

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="h-8 w-8 text-amber-500" />
          </motion.div>
          <p className="text-slate-400 text-sm font-medium">Cargando métricas del sistema...</p>
        </motion.div>
      </div>
    );
  }

  const salesPct = Math.min(100, Math.round((stats.monthlySales / stats.monthlyGoal) * 100));

  return (
    <div className="space-y-8 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
              Sistema Operativo
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Dashboard Principal
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Resumen ejecutivo y operaciones pendientes para hoy —{' '}
            {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => router.push('/invoices?new=true')}
          className="flex items-center gap-2 px-5 py-3 bg-amber-500 text-slate-950 text-sm font-bold rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Nueva Factura e-CF
        </button>
      </motion.div>

      {/* ── KPI Cards (4) ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Facturas Hoy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all hover:shadow-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +12%
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Facturas Hoy</p>
          <h3 className="text-3xl font-black text-white mt-1 tracking-tight">{stats.invoicesToday}</h3>
          <p className="text-xs text-slate-500 mt-2">Monto total: {fmt(stats.invoicesTodayAmount, true)}</p>
        </motion.div>

        {/* Pendientes DGII */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all hover:shadow-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <RefreshCw className="h-5 w-5 text-amber-400" />
            </div>
            {stats.pendingDgii > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                REINTENTANDO
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pendientes DGII</p>
          <h3 className="text-3xl font-black text-white mt-1 tracking-tight">{stats.pendingDgii}</h3>
          <p className="text-xs text-slate-500 mt-2">Tiempo prom. respuesta: 1.2s</p>
        </motion.div>

        {/* Ventas del Mes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all hover:shadow-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Ventas del Mes</p>
          <h3 className="text-2xl font-black text-white mt-1 tracking-tight">{fmt(stats.monthlySales, true)}</h3>
          <div className="mt-3">
            <div className="w-full bg-slate-800 h-1.5 rounded-full">
              <motion.div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${salesPct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">{salesPct}% de la meta mensual</p>
          </div>
        </motion.div>

        {/* Alertas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={clsx(
            'rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl',
            stats.alertCount > 0
              ? 'bg-red-900/30 border border-red-800/50 hover:border-red-700/60'
              : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
          )}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={clsx('p-2.5 rounded-xl', stats.alertCount > 0 ? 'bg-red-500/20' : 'bg-slate-800')}>
              <AlertCircle className={clsx('h-5 w-5', stats.alertCount > 0 ? 'text-red-400' : 'text-slate-400')} />
            </div>
          </div>
          <p className={clsx('text-xs font-semibold uppercase tracking-widest', stats.alertCount > 0 ? 'text-red-300' : 'text-slate-400')}>
            Alertas
          </p>
          <h3 className={clsx('text-3xl font-black mt-1 tracking-tight', stats.alertCount > 0 ? 'text-red-200' : 'text-white')}>
            {stats.alertCount}
          </h3>
          <p className={clsx('text-xs mt-2', stats.alertCount > 0 ? 'text-red-400' : 'text-slate-500')}>
            {stats.alertCount > 0 ? 'Acción requerida inmediata' : 'Sistema sin alertas'}
          </p>
        </motion.div>
      </div>

      {/* ── Charts + Activity row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="text-base font-bold text-white">Tendencia de Ventas (E-CF)</h4>
              <p className="text-xs text-slate-500 mt-0.5">Comprobantes fiscales emitidos y aceptados</p>
            </div>
            <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
              {(['semana', 'mes'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize',
                    chartPeriod === p ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div className="h-52 flex items-end justify-between gap-3 px-2">
            {WEEK_BARS.map((bar, idx) => (
              <div
                key={bar.day}
                className="flex-1 flex flex-col items-center gap-2 h-full justify-end relative group"
                onMouseEnter={() => setHoveredBar(idx)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Tooltip */}
                <AnimatePresence>
                  {hoveredBar === idx && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded-lg whitespace-nowrap z-10 shadow-xl"
                    >
                      {fmt(bar.amount, true)}
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Bar */}
                <motion.div
                  className={clsx(
                    'w-full rounded-t-lg transition-colors cursor-pointer',
                    bar.pct === 100 ? 'bg-amber-500' :
                    hoveredBar === idx ? 'bg-amber-400/60' : 'bg-slate-700 hover:bg-slate-600'
                  )}
                  style={{ height: `${bar.pct}%` }}
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.pct}%` }}
                  transition={{ duration: 0.6, delay: idx * 0.05, ease: 'easeOut' }}
                />
                <span className="text-[10px] font-mono text-slate-500">{bar.day}</span>
              </div>
            ))}
          </div>

          {/* Chart legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
              <span className="text-xs text-slate-400">Mayor volumen del periodo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" />
              <span className="text-xs text-slate-400">Días regulares</span>
            </div>
          </div>
        </motion.div>

        {/* Recent activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              Actividad Reciente
            </h4>
            <button className="text-xs text-amber-500 hover:text-amber-400 font-semibold flex items-center gap-1">
              Ver todo
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="flex-1 space-y-0 relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-800" />

            {RECENT_ACTIVITY.map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.07 }}
                className="flex gap-4 items-start pl-6 pb-5 relative"
              >
                {/* Dot */}
                <div className={clsx('absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900', activityDot[event.type])} />
                <div>
                  <p className={clsx('text-xs font-semibold', activityTextColor[event.type] || 'text-slate-200')}>
                    {event.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{event.subtitle}</p>
                  <p className="text-[10px] text-slate-600 font-mono mt-1">{event.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Quick Stats row ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {[
          { icon: <Shield className="h-4 w-4 text-blue-400" />, label: 'Total e-CF Emitidos', value: stats.totalInvoices.toLocaleString('es-DO'), bg: 'bg-blue-500/5 border-blue-500/20' },
          { icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, label: 'Aceptados DGII', value: `${stats.invoicesToday}`, bg: 'bg-emerald-500/5 border-emerald-500/20' },
          { icon: <Wallet className="h-4 w-4 text-amber-400" />, label: 'Sesiones de Caja', value: '1 activa', bg: 'bg-amber-500/5 border-amber-500/20' },
          { icon: <Zap className="h-4 w-4 text-purple-400" />, label: 'Tiempo Respuesta DGII', value: '< 2s', bg: 'bg-purple-500/5 border-purple-500/20' },
        ].map((stat, i) => (
          <div key={i} className={clsx('rounded-xl p-4 border flex items-center gap-3', stat.bg)}>
            <div className="p-2 bg-slate-900 rounded-lg">{stat.icon}</div>
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{stat.label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Últimos Comprobantes table ───────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
      >
        {/* Table header */}
        <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80">
          <div>
            <h4 className="text-base font-bold text-white">Últimos Comprobantes Emitidos</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Mostrando {filteredInvoices.length} de {stats.totalInvoices.toLocaleString('es-DO')} registros
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por RNC o Folio..."
                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none w-56"
              />
            </div>
            <a
              href="/invoices"
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-500 hover:text-amber-400 transition-colors whitespace-nowrap"
            >
              Ver todos
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-950/50 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <th className="px-6 py-4">Folio / NCF</th>
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Receptor</th>
                <th className="px-6 py-4 text-right">Monto (RD$)</th>
                <th className="px-6 py-4 text-center">Estado DGII</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((inv, i) => {
                  const badge = statusBadge(inv.status);
                  return (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.04 }}
                      className="hover:bg-amber-500/5 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-amber-400 group-hover:text-amber-300 transition-colors">
                          {inv.ncf || `e-${inv.ecfType}`}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Tipo: e-{inv.ecfType}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {new Date(inv.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        <br />
                        {new Date(inv.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-white">{inv.buyerName || 'Consumidor Final'}</p>
                        {inv.buyerRnc && (
                          <p className="text-[10px] text-slate-500 font-mono">RNC: {inv.buyerRnc}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-white">
                        {fmt(parseFloat(inv.total))}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold', badge.cls)}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', badge.dot)} />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-1">
                          <button
                            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Reenviar"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Building2 className="h-10 w-10 text-slate-700" />
                      <p className="text-slate-500 text-sm">
                        {searchQuery ? 'No se encontraron comprobantes con ese criterio.' : 'Aún no se han emitido comprobantes fiscales.'}
                      </p>
                      {!searchQuery && (
                        <button
                          onClick={() => router.push('/invoices?new=true')}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm font-semibold rounded-lg hover:bg-amber-500/20 transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Emitir primera factura e-CF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/60">
          <span className="text-xs text-slate-500">
            Mostrando {filteredInvoices.length} de {stats.totalInvoices.toLocaleString('es-DO')} registros
          </span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-400 hover:bg-slate-800 transition-colors">
              Anterior
            </button>
            <button className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-lg text-xs font-bold">1</button>
            <button className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-400 hover:bg-slate-800 transition-colors">
              Siguiente
            </button>
          </div>
        </div>
      </motion.section>

      {/* ── Quick access shortcuts ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {[
          {
            icon: <FileText className="h-5 w-5 text-blue-400" />,
            title: 'Emitir e-CF de Crédito Fiscal',
            subtitle: 'Facturas con valor de crédito fiscal (e-31)',
            href: '/invoices?new=true',
            badge: 'BILLING',
          },
          {
            icon: <Wallet className="h-5 w-5 text-amber-400" />,
            title: 'Apertura / Cuadre de Caja',
            subtitle: 'Iniciar o cerrar operaciones de cobro en terminal',
            href: '/cash',
            badge: 'CAJA',
          },
          {
            icon: <BarChart3 className="h-5 w-5 text-emerald-400" />,
            title: 'Ver Catálogo de Cuentas',
            subtitle: 'Revisar y registrar asientos contables manuales',
            href: '/dashboard/accounting',
            badge: 'CONTAB.',
          },
        ].map((shortcut) => (
          <a
            key={shortcut.href}
            href={shortcut.href}
            className="flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group"
          >
            <div className="p-2.5 bg-slate-800 rounded-xl group-hover:bg-slate-700 transition-colors">
              {shortcut.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white group-hover:text-amber-100 transition-colors truncate">
                {shortcut.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{shortcut.subtitle}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-amber-500 transition-colors shrink-0" />
          </a>
        ))}
      </motion.div>

    </div>
  );
}
