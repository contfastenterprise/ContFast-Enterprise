'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRbac } from '@/components/providers/rbacContext';
import { toast } from 'sonner';
import {
  FileText, RefreshCw, AlertCircle, TrendingUp, CheckCircle2, Send, Eye, Plus, History as HistoryIcon, Clock, ChevronRight, Search, Activity, Users, ShoppingCart, X
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
  dueGuaranteeChecksCount?: number;
  alertsDetails?: {
    id: string;
    type: string;
    title: string;
    description: string;
    actionText: string;
    actionLink: string;
  }[];
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
  const { user, loading: rbacLoading } = useRbac();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rbacLoading && user) {
      const role = (user.role || '').toLowerCase();
      if (role === 'facturacion') {
        toast.error('Acceso denegado. Redireccionando a Facturación.');
        router.replace('/dashboard/invoices');
      }
    }
  }, [user, rbacLoading, router]);

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
    dueGuaranteeChecksCount: 0,
  });
  const [chartPeriod, setChartPeriod] = useState<'semana' | 'mes'>('semana');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartData, setChartData] = useState<{ day: string, pct: number, amount: number }[]>([]);
  const [comparisonChart, setComparisonChart] = useState<{ day: string, sales: number, purchases: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string, total: number }[]>([]);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

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
          dueGuaranteeChecksCount: 0,
          alertsDetails: [],
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
        dueGuaranteeChecksCount: 0,
        alertsDetails: [],
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
    if (rbacLoading || !user) return;
    const role = (user.role || '').toLowerCase();
    if (role === 'facturacion') return;

    loadDashboardData();
  }, [loadDashboardData, user, rbacLoading]);

  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleViewPdf = (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/v1/invoices/${invoiceId}/print?reprint=true`, '_blank');
  };

  const handleResendEmail = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setResendingId(invoiceId);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/email`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Correo enviado', { description: data.message || 'El comprobante ha sido reenviado por correo.' });
      } else {
        toast.error('Error al enviar correo', { description: data.error?.message || 'No se pudo reenviar el comprobante.' });
      }
    } catch (error: any) {
      toast.error('Error de red', { description: error.message || 'Ocurrió un error al intentar conectar con el servidor.' });
    } finally {
      setResendingId(null);
    }
  };

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
      </header>

      {/* ── Warning Banner for Due Guarantee Checks ────────────────────────── */}
      {stats.dueGuaranteeChecksCount !== undefined && stats.dueGuaranteeChecksCount > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-250 rounded-3xl p-5 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-2xl">
              <Clock className="h-6 w-6 text-amber-700 animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-amber-900 text-sm">Cheques en Garantía Listos para Cobro</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Tienes {stats.dueGuaranteeChecksCount} cheque(s) en garantía cuya fecha de cobro se ha cumplido. Debes aplicarlos para procesar el pago correspondiente.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/purchases?tab=cheques')}
            className="bg-amber-600 hover:bg-amber-750 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all hover:shadow-md hover:shadow-amber-600/20 active:scale-95 cursor-pointer shrink-0"
          >
            Ver y Aplicar
          </button>
        </motion.div>
      )}

      {/* ── Summary Bento Grid ────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgb(239, 246, 255)"
          gradientColors={{
            primary: '#93c5fd',
            secondary: '#3b82f6',
            accent: '#1d4ed8'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-[inset_6px_0_10px_-3px_rgba(220,38,38,0.75),_inset_2px_2px_4px_rgba(255,255,255,0.85),_inset_-2px_-2px_4px_rgba(0,0,0,0.15),_0_15px_30px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="py-4 px-6">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-blue-100 p-2.5 rounded-xl group-hover:bg-blue-600 transition-colors">
                <FileText className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors" />
              </div>
              <span className={clsx(
                "text-[11px] px-2 py-0.5 rounded-full font-bold transition-all",
                (stats.invoicesTodayChangePct ?? 0) >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                {(stats.invoicesTodayChangePct ?? 0) >= 0 ? `+${stats.invoicesTodayChangePct ?? 0}` : stats.invoicesTodayChangePct}% vs ayer
              </span>
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Facturas Hoy</p>
            <h3 className="font-display-lg text-[25px] font-extrabold text-primary mt-0.5">{stats.invoicesToday}</h3>
            <p className="font-body-sm text-on-surface-variant/80 mt-2.5 font-medium text-[13px]">Monto total: <span className="text-primary font-bold">{fmt(stats.invoicesTodayAmount)}</span></p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgb(254, 243, 199)"
          gradientColors={{
            primary: '#fde047',
            secondary: '#f59e0b',
            accent: '#b45309'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-[inset_6px_0_10px_-3px_rgba(220,38,38,0.75),_inset_2px_2px_4px_rgba(255,255,255,0.85),_inset_-2px_-2px_4px_rgba(0,0,0,0.15),_0_15px_30px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="py-4 px-6">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-amber-100 p-2.5 rounded-xl group-hover:bg-amber-500 transition-colors">
                <RefreshCw className="h-5 w-5 text-amber-600 group-hover:text-white transition-colors" />
              </div>
              {stats.pendingDgii > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold tracking-tighter">REINTENTANDO</span>
              )}
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Pendientes DGII</p>
            <h3 className="font-display-lg text-[25px] font-extrabold text-primary mt-0.5">{stats.pendingDgii}</h3>
            <p className="font-body-sm text-on-surface-variant/80 mt-2.5 font-medium text-[13px]">Tiempo prom: <span className="text-primary font-bold">1.2s</span></p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgb(209, 250, 229)"
          gradientColors={{
            primary: '#6ee7b7',
            secondary: '#10b981',
            accent: '#047857'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-[inset_6px_0_10px_-3px_rgba(220,38,38,0.75),_inset_2px_2px_4px_rgba(255,255,255,0.85),_inset_-2px_-2px_4px_rgba(0,0,0,0.15),_0_15px_30px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 group backdrop-blur-md"
        >
          <div className="py-4 px-6">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-emerald-100 p-2.5 rounded-xl group-hover:bg-emerald-600 transition-colors">
                <TrendingUp className="h-5 w-5 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
            </div>
            <p className="font-label-md text-on-surface-variant/60 uppercase tracking-[0.1em] text-[10px] font-bold">Ventas del Mes</p>
            <h3 className="font-display-lg text-[25px] font-extrabold text-primary mt-0.5">{fmt(stats.monthlySales, true)}</h3>
            <div className="w-full bg-surface-container h-1.5 rounded-full mt-3.5 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-300 to-emerald-500 h-full rounded-full group-hover:translate-x-2 transition-transform duration-1000" style={{ width: `${salesPct}%` }}></div>
            </div>
            <p className="font-body-sm text-on-surface-variant/80 mt-2.5 font-medium text-[13px]">{salesPct}% de la meta mensual</p>
          </div>
        </BorderRotate>

        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgb(254, 226, 226)"
          gradientColors={{
            primary: '#fca5a5',
            secondary: '#ef4444',
            accent: '#b91c1c'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-[inset_6px_0_10px_-3px_rgba(220,38,38,0.75),_inset_2px_2px_4px_rgba(255,255,255,0.85),_inset_-2px_-2px_4px_rgba(0,0,0,0.15),_0_15px_30px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 group backdrop-blur-md cursor-pointer"
        >
          <div className="py-4 px-6 h-full" onClick={() => { if (stats.alertCount > 0) setShowAlertsModal(true); }}>
            <div className="flex justify-between items-start mb-4">
              <div className="bg-red-100 p-2.5 rounded-xl group-hover:bg-red-600 transition-colors">
                <AlertCircle className="h-5 w-5 text-red-600 group-hover:text-white transition-colors" />
              </div>
              {stats.alertCount > 0 && <span className="flex h-2.5 w-2.5 rounded-full bg-error animate-ping"></span>}
            </div>
            <p className="font-label-md text-error/70 uppercase tracking-[0.1em] text-[10px] font-bold">Alertas</p>
            <h3 className="font-display-lg text-[25px] font-extrabold text-error mt-0.5">{stats.alertCount}</h3>
            <p className="font-body-sm text-error/80 mt-2.5 font-bold text-[13px]">{stats.alertCount > 0 ? 'Ver detalles →' : 'Sistema en óptimas condiciones'}</p>
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
                ? "bg-[#003366] text-white shadow-md shadow-[#003366]/20"
                : "text-on-surface-variant/80 hover:bg-slate-100 hover:text-[#003366]"
            )}
          >
            Vista Semanal
          </button>
          <button
            onClick={() => setChartPeriod('mes')}
            className={clsx(
              "px-6 py-2.5 rounded-xl font-label-md text-xs font-bold transition-all duration-300 cursor-pointer",
              chartPeriod === 'mes'
                ? "bg-[#003366] text-white shadow-md shadow-[#003366]/20"
                : "text-on-surface-variant/80 hover:bg-slate-100 hover:text-[#003366]"
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
                          <button
                            onClick={(e) => handleViewPdf(inv.id, e)}
                            className="p-2 text-on-surface-variant bg-surface-variant/60 hover:bg-primary hover:text-on-primary rounded-xl transition-all shadow-sm"
                            title="Ver PDF"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => handleResendEmail(inv.id, e)}
                            disabled={resendingId === inv.id}
                            className="p-2 text-on-surface-variant bg-surface-variant/60 hover:bg-primary hover:text-on-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reenviar por Correo"
                          >
                            {resendingId === inv.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </button>
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

      {/* ── Alerts Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAlertsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-5 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-lowest">
                <div className="flex items-center gap-3">
                  <div className="bg-error/10 p-2.5 rounded-xl text-error">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-headline-md text-xl font-bold text-primary">Alertas del Sistema</h3>
                    <p className="text-sm font-medium text-on-surface-variant/70 mt-0.5">Atiende estos {stats.alertCount} avisos para mantener el sistema al día</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAlertsModal(false)}
                  className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                {stats.alertsDetails && stats.alertsDetails.length > 0 ? (
                  stats.alertsDetails.map((alert) => (
                    <div key={alert.id} className="border border-outline-variant/30 rounded-2xl p-5 hover:bg-surface-container-lowest transition-colors flex flex-col sm:flex-row gap-5 items-start">
                      <div className={clsx("p-3 rounded-2xl shrink-0 mt-1", alert.type === 'invoice_rejected' ? 'bg-error/10 text-error' : 'bg-amber-100 text-amber-700')}>
                        {alert.type === 'invoice_rejected' ? <AlertCircle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                      </div>
                      <div className="flex-1">
                        <h4 className={clsx("font-bold text-lg", alert.type === 'invoice_rejected' ? 'text-error' : 'text-amber-900')}>{alert.title}</h4>
                        <p className="text-sm font-medium text-on-surface-variant/80 mt-1.5 leading-relaxed">{alert.description}</p>
                        
                        <div className="mt-4">
                          <button
                            onClick={() => router.push(alert.actionLink)}
                            className={clsx("inline-flex items-center gap-1 text-sm font-bold transition-colors underline-offset-4 hover:underline", 
                              alert.type === 'invoice_rejected' 
                                ? "text-error hover:text-red-800" 
                                : "text-amber-700 hover:text-amber-900"
                            )}
                          >
                            {alert.actionText}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-bold text-on-surface-variant/70">Todo en orden</p>
                    <p className="text-sm text-on-surface-variant/50">No hay alertas activas en este momento.</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low text-right">
                <button
                  onClick={() => setShowAlertsModal(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-outline-variant/30 hover:bg-surface-container transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
