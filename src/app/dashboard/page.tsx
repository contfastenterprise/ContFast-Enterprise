'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, RefreshCw, AlertCircle, TrendingUp, CheckCircle2, Send, Eye, Plus, History as HistoryIcon, Clock, ChevronRight, Search, Activity, Users, ShoppingCart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import SkeletonBasic from '@/components/ui/skeleton';
import { BorderRotate } from '@/components/ui/animated-gradient-border';
import { SearchBar } from '@/components/ui/search-bar';
import dynamic from 'next/dynamic';

const DashboardCharts = dynamic(() => import('./DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8 h-96 animate-pulse flex flex-col justify-between">
        <div className="h-6 w-1/3 bg-slate-200 rounded-md"></div>
        <div className="h-64 bg-slate-100 rounded-2xl w-full"></div>
      </div>
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8 h-96 animate-pulse flex flex-col justify-between">
        <div className="h-6 w-1/3 bg-slate-200 rounded-md"></div>
        <div className="h-64 bg-slate-100 rounded-2xl w-full"></div>
      </div>
    </div>
  )
});

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
  invoicesTodayChangePct?: number;
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

// ─── Recent activity ───────────────────────────────────────────────────────────
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
    invoicesTodayChangePct: 0,
    pendingDgii: 0,
    monthlySales: 0,
    monthlyGoal: 2_000_000,
    alertCount: 0,
    totalInvoices: 0,
  });
  const [chartPeriod, setChartPeriod] = useState<'semana' | 'mes'>('semana');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartData, setChartData] = useState<{ day: string, pct: number, amount: number }[]>([]);
  const [comparisonChart, setComparisonChart] = useState<{ day: string, sales: number, purchases: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string, total: number }[]>([]);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard?period=${chartPeriod}`);
      const data = await res.json();

      if (data.success && data.data) {
        setRecentInvoices(data.data.recent || []);
        setStats(data.data.stats || {
          invoicesToday: 0,
          invoicesTodayAmount: 0,
          invoicesTodayChangePct: 0,
          pendingDgii: 0,
          monthlySales: 0,
          monthlyGoal: 2_000_000,
          alertCount: 0,
          totalInvoices: 0,
        });
        setChartData(data.data.chart || []);
        setComparisonChart(data.data.comparisonChart || []);
        setTopCustomers(data.data.topCustomers || []);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      // Demo Data
      setStats({
        invoicesToday: 0,
        invoicesTodayAmount: 0,
        invoicesTodayChangePct: 0,
        pendingDgii: 0,
        monthlySales: 0,
        monthlyGoal: 2_000_000,
        alertCount: 0,
        totalInvoices: 0,
      });
      setChartData([]);
      setComparisonChart([]);
      setTopCustomers([]);
      setRecentInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [chartPeriod]);

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
      <div className="space-y-10 pb-8">
        <header className="flex flex-col gap-2">
          <div className="h-9 w-64 bg-slate-200/60 rounded-xl animate-pulse"></div>
          <div className="h-5 w-96 bg-slate-200/40 rounded-xl animate-pulse"></div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <SkeletonBasic />
          <SkeletonBasic />
          <SkeletonBasic />
          <SkeletonBasic />
        </div>
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
          onClick={() => router.push('/dashboard/invoices')}
          className="bg-primary text-on-primary px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1 active:scale-95 group"
        >
          <Plus className="h-5 w-5 group-hover:rotate-90 transition-transform" />
          <span className="font-label-md text-sm font-bold">Nueva Factura</span>
        </button>
      </header>

      {/* ── Summary Bento Grid ────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgba(239, 246, 255, 0.85)"
          gradientColors={{
            primary: '#93c5fd',
            secondary: '#3b82f6',
            accent: '#1d4ed8'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-2xl transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-blue-100 p-3 rounded-2xl group-hover:bg-blue-600 transition-colors">
                <FileText className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
              </div>
              <span className={clsx(
                "text-[11px] px-2 py-1 rounded-full font-bold transition-all",
                (stats.invoicesTodayChangePct ?? 0) >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                {(stats.invoicesTodayChangePct ?? 0) >= 0 ? `+${stats.invoicesTodayChangePct ?? 0}` : stats.invoicesTodayChangePct}% vs ayer
              </span>
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Facturas Hoy</p>
            <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{stats.invoicesToday}</h3>
            <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">Monto total: <span className="text-primary font-bold">{fmt(stats.invoicesTodayAmount)}</span></p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgba(254, 243, 199, 0.85)"
          gradientColors={{
            primary: '#fde047',
            secondary: '#f59e0b',
            accent: '#b45309'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-2xl transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-amber-100 p-3 rounded-2xl group-hover:bg-amber-500 transition-colors">
                <RefreshCw className="h-6 w-6 text-amber-600 group-hover:text-white transition-colors" />
              </div>
              {stats.pendingDgii > 0 && (
                <span className="px-2 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold tracking-tighter">REINTENTANDO</span>
              )}
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Pendientes DGII</p>
            <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{stats.pendingDgii}</h3>
            <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">Tiempo prom: <span className="text-primary font-bold">1.2s</span></p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgba(209, 250, 229, 0.85)"
          gradientColors={{
            primary: '#6ee7b7',
            secondary: '#10b981',
            accent: '#047857'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-2xl transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-emerald-100 p-3 rounded-2xl group-hover:bg-emerald-600 transition-colors">
                <TrendingUp className="h-6 w-6 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Ventas del Mes</p>
            <h3 className="font-display-lg text-3xl font-extrabold text-primary mt-1">{fmt(stats.monthlySales, true)}</h3>
            <div className="w-full bg-surface-container h-2 rounded-full mt-5 overflow-hidden">
              <div className="bg-gradient-to-r from-primary to-surface-tint h-full rounded-full group-hover:translate-x-2 transition-transform duration-1000" style={{ width: `${salesPct}%` }}></div>
            </div>
            <p className="font-body-sm text-on-surface-variant/80 mt-3 font-medium">{salesPct}% de la meta mensual</p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgba(254, 226, 226, 0.85)"
          gradientColors={{
            primary: '#fca5a5',
            secondary: '#ef4444',
            accent: '#b91c1c'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-2xl transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-red-100 p-3 rounded-2xl group-hover:bg-red-600 transition-colors">
                <AlertCircle className="h-6 w-6 text-red-600 group-hover:text-white transition-colors" />
              </div>
              {stats.alertCount > 0 && <span className="flex h-3 w-3 rounded-full bg-error animate-ping"></span>}
            </div>
            <p className="font-label-md text-error/70 uppercase tracking-[0.1em] text-[10px] font-bold">Alertas</p>
            <h3 className="font-display-lg text-3xl font-extrabold text-error mt-1">{stats.alertCount}</h3>
            <p className="font-body-sm text-error/80 mt-3 font-bold">{stats.alertCount > 0 ? 'Acción requerida inmediata' : 'Sistema en óptimas condiciones'}</p>
          </div>
        </BorderRotate>
      </section>

      {/* ── Period Selector ──────────────────────────────────────── */}
      <div className="flex justify-end items-center gap-2">
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm p-1.5 rounded-2xl flex gap-1.5">
          <button
            onClick={() => setChartPeriod('semana')}
            className={clsx(
              "px-6 py-2.5 rounded-xl font-label-md text-xs font-bold transition-all duration-300 cursor-pointer",
              chartPeriod === 'semana'
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-on-surface-variant/80 hover:bg-slate-100 hover:text-primary"
            )}
          >
            Vista Semanal
          </button>
          <button
            onClick={() => setChartPeriod('mes')}
            className={clsx(
              "px-6 py-2.5 rounded-xl font-label-md text-xs font-bold transition-all duration-300 cursor-pointer",
              chartPeriod === 'mes'
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-on-surface-variant/80 hover:bg-slate-100 hover:text-primary"
            )}
          >
            Vista Mensual
          </button>
        </div>
      </div>

      {/* ── Charts and Activity Section ─────────────────────────────────────── */}
      <DashboardCharts chartData={chartData} comparisonChart={comparisonChart} period={chartPeriod} />

      {/* ── Top Customers and Activity Section ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Customers Table */}
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-headline-md text-xl font-bold text-primary">Top Clientes del Mes</h4>
            <Users className="h-5 w-5 text-on-surface-variant/40" />
          </div>
          <div className="space-y-4 flex-1">
            {topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low hover:bg-white hover:shadow-sm transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-label-md font-bold text-on-surface">{c.name}</p>
                    <p className="text-xs text-on-surface-variant font-medium mt-0.5">Cliente Frecuente</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono-data font-bold text-primary">{fmt(c.total)}</p>
                </div>
              </div>
            ))}
            {topCustomers.length === 0 && (
              <div className="text-center text-sm text-on-surface-variant/60 py-4">No hay datos suficientes este mes.</div>
            )}
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-headline-md text-xl font-bold text-primary">Actividad</h4>
            <HistoryIcon className="h-5 w-5 text-on-surface-variant/40" />
          </div>
          <div className="space-y-6 flex-1 pr-2 overflow-y-auto max-h-64 custom-scrollbar">
            {filteredInvoices.slice(0, 5).map((inv, i) => (
              <div key={i} className={clsx("flex gap-4 items-start border-l-2 pl-6 relative", inv.status === 'rejected' ? 'border-error/20' : 'border-primary/20')}>
                <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm ${inv.status === 'rejected' ? 'bg-error' : 'bg-primary'}`}></div>
                <div>
                  <p className={clsx("font-label-md font-bold", inv.status === 'rejected' ? 'text-error' : 'text-primary')}>{inv.ncf || `e-${inv.ecfType}`}</p>
                  <p className="font-body-sm text-on-surface-variant/80 mt-0.5">{inv.buyerName || 'Consumidor Final'}</p>
                  <p className="text-[10px] text-outline font-mono-data mt-1.5 font-bold opacity-70">Hace {Math.round((Date.now() - new Date(inv.createdAt).getTime()) / 60000)} mins</p>
                </div>
              </div>
            ))}
            {filteredInvoices.length === 0 && (
              <div className="text-center text-sm text-on-surface-variant/60 py-4">No hay actividad reciente.</div>
            )}
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
          <div className="w-full md:w-80">
            <SearchBar
              placeholder="Buscar por RNC o Folio..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
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
                          <button className="p-2 bg-surface-variant/60 hover:bg-primary hover:text-primary rounded-xl transition-all shadow-sm" title="Ver PDF"><Eye className="h-4 w-4" /></button>
                          <button className="p-2 bg-surface-variant/60 hover:bg-primary hover:text-primary rounded-xl transition-all shadow-sm" title="Reenviar"><Send className="h-4 w-4" /></button>
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
