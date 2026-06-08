'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, RefreshCw, AlertCircle, TrendingUp, CheckCircle2, Send, Eye, Plus, History, Clock, ChevronRight, Search, Activity
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

// ─── Week bar chart data ───────────────────────────────────────────────────────
const WEEK_BARS = [
  { day: 'LUN', pct: 40, amount: 12400 },
  { day: 'MAR', pct: 55, amount: 18200 },
  { day: 'MIE', pct: 45, amount: 15100 },
  { day: 'JUE', pct: 70, amount: 24300 },
  { day: 'VIE', pct: 90, amount: 31800 },
  { day: 'SAB', pct: 65, amount: 21500 },
  { day: 'DOM', pct: 100, amount: 38200 },
];

const RECENT_ACTIVITY = [
  { type: 'success', title: 'Factura E310000000452', subtitle: 'Aceptada por DGII', time: 'Hace 12 mins', dot: 'bg-primary' },
  { type: 'warning', title: 'Nota de Crédito Generada', subtitle: 'Cliente: Distribuidora Nacional', time: 'Hace 1 hora', dot: 'bg-secondary-fixed-dim' },
  { type: 'error', title: 'Error de Validación', subtitle: 'RNC receptor inválido en E3100...', time: 'Hace 3 horas', dot: 'bg-error' },
];

// ─── Status badge map ──────────────────────────────────────────────────────────
const statusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'accepted':
    case 'signed':
      return { label: 'ACEPTADO', cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> };
    case 'submitted':
    case 'pending':
      return { label: 'ENVIADO', cls: 'bg-blue-100 text-blue-700', icon: <Clock className="h-4 w-4" /> };
    case 'rejected':
      return { label: 'RECHAZADO', cls: 'bg-red-100 text-red-700', icon: <AlertCircle className="h-4 w-4" /> };
    default:
      return { label: status.toUpperCase(), cls: 'bg-gray-100 text-gray-700', icon: <FileText className="h-4 w-4" /> };
  }
};

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
      // Demo Data
      setStats({
        invoicesToday: 142,
        invoicesTodayAmount: 45230,
        pendingDgii: 3,
        monthlySales: 1420000,
        monthlyGoal: 2000000,
        alertCount: 2,
        totalInvoices: 1240,
      });
      setRecentInvoices([
        { id: '1', ncf: 'E310000000452', ecfType: '31', status: 'accepted', total: '12400', createdAt: new Date().toISOString(), buyerName: 'Grupo SID, S.A.', buyerRnc: '101001156' },
        { id: '2', ncf: 'E310000000451', ecfType: '31', status: 'accepted', total: '4250.50', createdAt: new Date(Date.now() - 3600000).toISOString(), buyerName: 'Ferreteria Americana', buyerRnc: '101015092' },
        { id: '3', ncf: 'E310000000450', ecfType: '31', status: 'submitted', total: '28100', createdAt: new Date(Date.now() - 7200000).toISOString(), buyerName: 'Induveca, S.A.', buyerRnc: '101004561' },
      ]);
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

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <motion.div className="flex flex-col items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
            <RefreshCw className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-on-surface-variant font-medium">Cargando métricas del sistema...</p>
        </motion.div>
      </div>
    );
  }

  const salesPct = Math.min(100, Math.round((stats.monthlySales / stats.monthlyGoal) * 100));

  return (
    <div className="space-y-10 pb-8 animate-fade-in-up">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold">Dashboard Principal</h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">Resumen ejecutivo y operaciones pendientes para hoy.</p>
        </div>
        <button
          onClick={() => router.push('/invoices?new=true')}
          className="bg-primary text-on-primary px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1 active:scale-95 group"
        >
          <Plus className="h-5 w-5 group-hover:rotate-90 transition-transform" />
          <span className="font-label-md text-sm font-bold">Nueva Factura</span>
        </button>
      </header>

      {/* ── Summary Bento Grid ────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)] p-6 rounded-3xl hover:shadow-2xl transition-all hover:-translate-y-1 group">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-primary/10 p-3 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
              <FileText className="h-6 w-6 text-primary group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">+12% vs ayer</span>
          </div>
          <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Facturas Hoy</p>
          <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{stats.invoicesToday}</h3>
          <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">Monto total: <span className="text-primary font-bold">{fmt(stats.invoicesTodayAmount)}</span></p>
        </div>

        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)] p-6 rounded-3xl hover:shadow-2xl transition-all hover:-translate-y-1 group">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-secondary/10 p-3 rounded-2xl group-hover:bg-secondary group-hover:text-white transition-colors">
              <RefreshCw className="h-6 w-6 text-secondary group-hover:text-white transition-colors" />
            </div>
            {stats.pendingDgii > 0 && (
              <span className="px-2 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold tracking-tighter">REINTENTANDO</span>
            )}
          </div>
          <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Pendientes DGII</p>
          <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{stats.pendingDgii}</h3>
          <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">Tiempo prom: <span className="text-primary font-bold">1.2s</span></p>
        </div>

        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)] p-6 rounded-3xl hover:shadow-2xl transition-all hover:-translate-y-1 group">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-tertiary-container/10 p-3 rounded-2xl group-hover:bg-primary transition-colors">
              <TrendingUp className="h-6 w-6 text-tertiary group-hover:text-white transition-colors" />
            </div>
          </div>
          <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Ventas del Mes</p>
          <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{fmt(stats.monthlySales, true)}</h3>
          <div className="w-full bg-surface-container h-2 rounded-full mt-5 overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-surface-tint h-full rounded-full group-hover:translate-x-2 transition-transform duration-1000" style={{ width: `${salesPct}%` }}></div>
          </div>
          <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">{salesPct}% de la meta mensual</p>
        </div>

        <div className="bg-gradient-to-br from-error/10 to-error/5 border border-error/20 p-6 rounded-3xl hover:shadow-2xl transition-all hover:-translate-y-1 group">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-error/10 p-3 rounded-2xl group-hover:bg-error group-hover:text-white transition-colors">
              <AlertCircle className="h-6 w-6 text-error group-hover:text-white transition-colors" />
            </div>
            {stats.alertCount > 0 && <span className="flex h-3 w-3 rounded-full bg-error animate-ping"></span>}
          </div>
          <p className="font-label-md text-error/70 uppercase tracking-[0.1em] text-[10px] font-bold">Alertas</p>
          <h3 className="font-display-lg text-3xl font-extrabold text-error mt-1">{stats.alertCount}</h3>
          <p className="font-body-sm text-error/80 mt-3 font-bold">{stats.alertCount > 0 ? 'Acción requerida inmediata' : 'Sistema en óptimas condiciones'}</p>
        </div>
      </section>

      {/* ── Charts and Activity Section ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className="font-headline-md text-xl font-bold text-primary">Tendencia de Ventas (E-CF)</h4>
              <p className="text-body-sm text-on-surface-variant/60 font-medium">Análisis semanal de emisión</p>
            </div>
            <div className="flex p-1 bg-surface-container-high rounded-xl">
              {(['semana', 'mes'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={clsx('text-xs px-5 py-2 font-bold rounded-lg transition-all capitalize', chartPeriod === p ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-primary')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 flex items-end justify-between gap-4 sm:gap-6 px-2 sm:px-4">
            {WEEK_BARS.map((bar, idx) => (
              <div
                key={idx}
                onMouseEnter={() => setHoveredBar(idx)}
                onMouseLeave={() => setHoveredBar(null)}
                className={clsx('flex-1 rounded-2xl relative group cursor-pointer transition-all duration-500 shadow-sm', bar.pct === 100 ? 'bg-gradient-to-t from-primary to-surface-tint shadow-lg shadow-primary/20' : 'bg-primary/10 hover:bg-primary')}
                style={{ height: `${bar.pct}%` }}
              >
                <AnimatePresence>
                  {(hoveredBar === idx || bar.pct === 100) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] sm:text-[11px] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg shadow-lg whitespace-nowrap z-10"
                    >
                      {fmt(bar.amount, true)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-6 text-[10px] sm:text-[11px] text-on-surface-variant font-bold tracking-widest px-2 sm:px-4">
            {WEEK_BARS.map(bar => <span key={bar.day}>{bar.day}</span>)}
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-headline-md text-xl font-bold text-primary">Actividad</h4>
            <History className="h-5 w-5 text-on-surface-variant/40" />
          </div>
          <div className="space-y-6 flex-1 pr-2">
            {RECENT_ACTIVITY.map((event, i) => (
              <div key={i} className="flex gap-4 items-start border-l-2 border-primary/20 pl-6 relative">
                <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm ${event.dot}`}></div>
                <div>
                  <p className={clsx("font-label-md font-bold", event.type === 'error' ? 'text-error' : 'text-primary')}>{event.title}</p>
                  <p className="font-body-sm text-on-surface-variant/80 mt-0.5">{event.subtitle}</p>
                  <p className="text-[10px] text-outline font-mono-data mt-1.5 font-bold opacity-70">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-6 w-full text-center text-primary font-label-md font-bold hover:bg-primary/5 py-3 rounded-xl transition-all border border-primary/10 text-sm">
            Ver todo el historial
          </button>
        </div>
      </div>

      {/* ── Detailed Data Table Section ─────────────────────────────────────── */}
      <section className="bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)] rounded-3xl overflow-hidden">
        <div className="p-6 md:p-8 border-b border-outline-variant/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h4 className="font-headline-md text-xl font-bold text-primary">Últimos Comprobantes Emitidos</h4>
            <p className="text-body-sm text-on-surface-variant/60 mt-1 font-medium">Monitoreo en tiempo real de transacciones</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por RNC o Folio..."
              className="pl-12 pr-6 py-3 bg-surface-container-high border-none rounded-2xl text-body-sm font-medium w-full focus:ring-2 focus:ring-primary focus:bg-white transition-all shadow-inner outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10">
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Folio</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Fecha/Hora</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Receptor</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Monto (RD$)</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Estado DGII</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((inv) => {
                  const badge = statusBadge(inv.status);
                  const date = new Date(inv.createdAt);
                  return (
                    <tr key={inv.id} className="hover:bg-primary/5 transition-all group cursor-pointer">
                      <td className="px-6 py-5 font-mono-data text-primary font-bold text-base">{inv.ncf || `e-${inv.ecfType}`}</td>
                      <td className="px-6 py-5 font-body-sm text-on-surface-variant/80 font-medium">
                        {date.toLocaleDateString('es-DO')} <span className="block text-[10px] font-bold opacity-60 mt-0.5">{date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-label-md font-bold text-primary text-sm">{inv.buyerName || 'Consumidor Final'}</p>
                        {inv.buyerRnc && <p className="text-[11px] text-on-surface-variant/60 font-mono-data mt-0.5">RNC: {inv.buyerRnc}</p>}
                      </td>
                      <td className="px-6 py-5 font-mono-data font-black text-primary text-base">{fmt(parseFloat(inv.total))}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${badge.cls} text-[10px] font-black uppercase tracking-wider`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                          <button className="p-2 bg-surface-variant/60 hover:bg-primary hover:text-white rounded-xl transition-all shadow-sm" title="Ver PDF"><Eye className="h-4 w-4" /></button>
                          <button className="p-2 bg-surface-variant/60 hover:bg-primary hover:text-white rounded-xl transition-all shadow-sm" title="Reenviar"><Send className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                    No hay registros que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-surface-container-low/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-xs text-on-surface-variant/70 font-medium">Mostrando <span className="text-primary font-bold">{filteredInvoices.length}</span> de {stats.totalInvoices} registros</span>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-outline-variant/30 rounded-xl hover:bg-white hover:shadow-sm transition-all text-xs font-bold text-on-surface-variant">Anterior</button>
            <button className="px-4 py-2 rounded-xl bg-primary text-on-primary shadow-md shadow-primary/20 transition-all text-xs font-bold">1</button>
            <button className="px-4 py-2 border border-outline-variant/30 rounded-xl hover:bg-white hover:shadow-sm transition-all text-xs font-bold text-on-surface-variant">Siguiente</button>
          </div>
        </div>
      </section>
    </div>
  );
}
