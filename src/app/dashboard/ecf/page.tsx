'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  RefreshCw,
  Eye,
  ArrowRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  X,
  Activity,
  Database,
  CreditCard,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  totalTaxes: string;
  total: string;
  buyerRnc?: string;
  buyerName?: string;
  msellerTrackId?: string;
  dgiiMessage?: string;
  customerId?: string;
  createdAt: string;
}

interface ECFStats {
  totalAmount: string;
  totalITBIS: string;
  totalCount: number;
  byType: Record<string, { count: number; amount: string }>;
  byStatus: Record<string, number>;
  approvalRate: number;
}

interface Submission {
  id: string;
  invoiceId: string;
  ncf?: string;
  ecfType?: string;
  trackId?: string;
  status: string;
  responseMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Sequence {
  id: string;
  ecfType: string;
  prefix: string;
  currentSequence: number;
  maxSequence: number;
  expiryDate?: string;
  sequenceExpiry?: string;
  status: string;
  usedCount: number;
}

interface CreditDebitNote {
  id: string;
  ncf: string;
  type: string;
  invoiceId: string;
  reason: string;
  amount: string;
  status: string;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ECF_TYPE_LABELS: Record<string, string> = {
  '31': 'Crédito Fiscal',
  '32': 'Consumo',
  '33': 'Nota Débito',
  '34': 'Nota Crédito',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: <Clock className="h-3 w-3" /> },
  signed: { label: 'Firmado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <FileText className="h-3 w-3" /> },
  submitted: { label: 'Enviado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <Activity className="h-3 w-3" /> },
  accepted: { label: 'Aceptado', color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', icon: <XCircle className="h-3 w-3" /> },
  failed: { label: 'Fallido', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300', icon: <AlertTriangle className="h-3 w-3" /> },
  void: { label: 'Anulado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: <X className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['draft'];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function ECFTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    '31': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    '32': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
    '33': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    '34': 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
      e-{type}
    </span>
  );
}

function formatCurrency(amount: string | number) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return 'RD$0.00';
  return `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ─── Skeleton ───────────────────────────────────────────────────────────────────

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
  );
}

// ─── New Sequence Modal ──────────────────────────────────────────────────────────

interface NewSeqModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NewSequenceModal({ open, onClose, onSuccess }: NewSeqModalProps) {
  const [form, setForm] = useState({
    ecfType: '31',
    prefix: 'E',
    startSequence: '1',
    maxSequence: '1000',
    sequenceExpiry: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startSequence: parseInt(form.startSequence, 10),
          maxSequence: parseInt(form.maxSequence, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al crear secuencia');
      toast.success('Secuencia SACF creada exitosamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-primary">Nueva Autorización SACF</h3>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo e-CF</label>
              <select
                value={form.ecfType}
                onChange={(e) => setForm((f) => ({ ...f, ecfType: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="31">e-31 — Crédito Fiscal</option>
                <option value="32">e-32 — Consumo</option>
                <option value="33">e-33 — Nota Débito</option>
                <option value="34">e-34 — Nota Crédito</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secuencia Desde</label>
                <input
                  type="number"
                  min="1"
                  value={form.startSequence}
                  onChange={(e) => setForm((f) => ({ ...f, startSequence: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secuencia Hasta</label>
                <input
                  type="number"
                  min="2"
                  value={form.maxSequence}
                  onChange={(e) => setForm((f) => ({ ...f, maxSequence: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha Vencimiento <span className="text-gray-400 text-xs">(dd-MM-yyyy)</span>
              </label>
              <input
                type="text"
                placeholder="31-12-2026"
                value={form.sequenceExpiry}
                onChange={(e) => setForm((f) => ({ ...f, sequenceExpiry: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                pattern="\d{2}-\d{2}-\d{4}"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Tab Components ──────────────────────────────────────────────────────────────

// Tab 1: Comprobantes
function ComprobantesTab() {
  const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [stats, setStats] = useState<ECFStats | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [filters, setFilters] = useState({ status: '', ecfType: '', from: '', to: '', q: '' });
  const [page, setPage] = useState(1);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/v1/ecf/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: '20' });
      if (filters.status) params.set('status', filters.status);
      if (filters.ecfType) params.set('ecfType', filters.ecfType);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.q) params.set('q', filters.q);

      const res = await fetch(`/api/v1/ecf?${params}`);
      const data = await res.json();
      if (data.success) {
        setInvoiceList(data.data);
        setMeta(data.meta);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchStats(); fetchInvoices(); }, [fetchStats, fetchInvoices]);

  const handleRefreshStatus = async (inv: Invoice) => {
    setRefreshingId(inv.id);
    try {
      const res = await fetch(`/api/v1/ecf/${inv.id}/dgii-status`);
      const data = await res.json();
      if (data.success) {
        toast.success(`Estado actualizado: ${data.data.dgiiStatus || data.data.status}`);
        fetchInvoices();
      } else {
        toast.error(data.error?.message || 'Error al consultar estado');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleResubmit = async (inv: Invoice) => {
    setResubmittingId(inv.id);
    try {
      const res = await fetch(`/api/v1/ecf/${inv.id}/resubmit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Reenvío encolado exitosamente');
        fetchInvoices();
      } else {
        toast.error(data.error?.message || 'Error al reenviar');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResubmittingId(null);
    }
  };

  const kpis = [
    {
      title: 'Total Facturado',
      value: formatCurrency(stats?.totalAmount || '0'),
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'from-primary/10 to-primary/5 border-primary/20',
      iconColor: 'text-primary',
    },
    {
      title: 'ITBIS Recaudado',
      value: formatCurrency(stats?.totalITBIS || '0'),
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'from-secondary/10 to-secondary/5 border-secondary/20',
      iconColor: 'text-secondary',
    },
    {
      title: '% Aprobados',
      value: `${stats?.approvalRate ?? 0}%`,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'from-green-500/10 to-green-600/5 border-green-200 dark:border-green-800',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Total Comprobantes',
      value: stats?.totalCount?.toLocaleString() ?? '0',
      icon: <FileText className="h-5 w-5" />,
      color: 'from-primary/5 to-primary/5 border-primary/10',
      iconColor: 'text-primary/70',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingStats
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border bg-gradient-to-br ${kpi.color} p-5 flex flex-col gap-2`}
              >
                <div className={`${kpi.iconColor}`}>{kpi.icon}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{kpi.title}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-primary">{kpi.value}</p>
              </motion.div>
            ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por NCF..."
              value={filters.q}
              onChange={(e) => { setFilters((f) => ({ ...f, q: e.target.value })); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <select
            value={filters.ecfType}
            onChange={(e) => { setFilters((f) => ({ ...f, ecfType: e.target.value })); setPage(1); }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todos los tipos</option>
            <option value="31">e-31 Crédito Fiscal</option>
            <option value="32">e-32 Consumo</option>
            <option value="33">e-33 Nota Débito</option>
            <option value="34">e-34 Nota Crédito</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="submitted">Enviado</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="failed">Fallido</option>
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); setPage(1); }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); setPage(1); }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {(filters.q || filters.ecfType || filters.status || filters.from || filters.to) && (
            <button
              onClick={() => { setFilters({ status: '', ecfType: '', from: '', to: '', q: '' }); setPage(1); }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          {loadingList ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : invoiceList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <FileText className="h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">No se encontraron comprobantes</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCF</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Comprador</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ITBIS</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invoiceList.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{inv.ncf}</span>
                    </td>
                    <td className="px-4 py-3"><ECFTypeBadge type={inv.ecfType} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[180px]">
                          {inv.buyerName || 'CONSUMIDOR FINAL'}
                        </span>
                        {inv.buyerRnc && (
                          <span className="text-xs text-gray-400 font-mono">{inv.buyerRnc}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-primary whitespace-nowrap">
                      {formatCurrency(inv.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatCurrency(inv.totalTaxes)}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Ver detalle"
                          onClick={() => window.open(`/dashboard/invoices/${inv.id}`, '_blank')}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Consultar estado DGII"
                          onClick={() => handleRefreshStatus(inv)}
                          disabled={refreshingId === inv.id}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                        >
                          {refreshingId === inv.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                        </button>
                        {['rejected', 'failed'].includes(inv.status) && (
                          <button
                            title="Reenviar a DGII"
                            onClick={() => handleResubmit(inv)}
                            disabled={resubmittingId === inv.id}
                            className="p-1.5 rounded-lg hover:bg-secondary/10 text-secondary transition-colors disabled:opacity-50"
                          >
                            {resubmittingId === inv.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ArrowRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500">
              {meta.total} comprobantes • Página {meta.page} de {meta.total_pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                disabled={page >= meta.total_pages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab 2: Cola DGII
function ColaTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/queue');
      const data = await res.json();
      if (data.success) setSubmissions(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const failedSubmissions = submissions.filter((s) => s.status === 'failed');

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      let count = 0;
      for (const sub of failedSubmissions) {
        const res = await fetch(`/api/v1/ecf/${sub.invoiceId}/resubmit`, { method: 'POST' });
        const data = await res.json();
        if (data.success) count++;
      }
      toast.success(`${count} facturas reenviadas a la cola DGII`);
      fetchSubmissions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {submissions.filter((s) => s.status === 'processing').length} procesando
            </span>
          </div>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span className="text-sm text-red-500">{failedSubmissions.length} fallidos</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSubmissions}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
          {failedSubmissions.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-on-secondary text-sm font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-60"
            >
              {retryingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Reintentar todos ({failedSubmissions.length})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} /></div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <Activity className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">Cola vacía</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reintentos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {(sub as any).ncf || sub.invoiceId.substring(0, 8) + '…'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${sub.retryCount > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {sub.retryCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-500 max-w-[240px] truncate">
                    {sub.responseMessage || '–'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(sub.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Tab 3: Secuencias SACF
function SecuenciasTab() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/sequences');
      const data = await res.json();
      if (data.success) setSequences(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  const handleToggleStatus = async (seq: Sequence) => {
    const newStatus = seq.status === 'active' ? 'inactive' : 'active';
    setTogglingId(seq.id);
    try {
      const res = await fetch(`/api/v1/ecf/sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Secuencia ${newStatus === 'active' ? 'activada' : 'desactivada'}`);
        fetchSequences();
      } else {
        toast.error(data.error?.message || 'Error al actualizar');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const getUsagePercent = (seq: Sequence) => {
    if (seq.maxSequence <= 0) return 0;
    return Math.min(100, Math.round((seq.usedCount / seq.maxSequence) * 100));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {sequences.length} secuencia{sequences.length !== 1 ? 's' : ''} configurada{sequences.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Nueva Autorización
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Database className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">No hay secuencias SACF configuradas</p>
          <button onClick={() => setShowModal(true)} className="text-primary text-sm font-semibold hover:underline">
            Crear primera secuencia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sequences.map((seq) => {
            const usedPct = getUsagePercent(seq);
            const isNearLimit = usedPct >= 90;
            const expiry = seq.sequenceExpiry || (seq.expiryDate ? seq.expiryDate : '');
            const isExpiringSoon = expiry && (() => {
              const [dd, mm, yyyy] = expiry.split('-');
              const expDate = new Date(`${yyyy}-${mm}-${dd}`);
              return (expDate.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
            })();

            return (
              <motion.div
                key={seq.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-5 bg-white dark:bg-gray-900 ${
                  isNearLimit
                    ? 'border-orange-300 dark:border-orange-700'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <ECFTypeBadge type={seq.ecfType} />
                    <span className="font-semibold text-gray-900 dark:text-primary">
                      {ECF_TYPE_LABELS[seq.ecfType] || `Tipo ${seq.ecfType}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleStatus(seq)}
                    disabled={togglingId === seq.id}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      seq.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {togglingId === seq.id ? '...' : seq.status === 'active' ? 'Activo' : 'Inactivo'}
                  </button>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span>Rango:</span>
                    <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                      {seq.prefix}{seq.ecfType}00000001 – {seq.prefix}{seq.ecfType}{seq.maxSequence.toString().padStart(8, '0')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usados:</span>
                    <span className={`font-semibold ${isNearLimit ? 'text-orange-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      {seq.usedCount} / {seq.maxSequence}
                    </span>
                  </div>
                  {expiry && (
                    <div className="flex justify-between">
                      <span>Vencimiento:</span>
                      <span className={`font-semibold ${isExpiringSoon ? 'text-orange-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {expiry}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      usedPct >= 90 ? 'bg-orange-500' : usedPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">{usedPct}% usado</span>
                  <span className="text-xs text-gray-400">{seq.maxSequence - seq.usedCount} disponibles</span>
                </div>

                {isNearLimit && (
                  <div className="mt-3 flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs font-semibold bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Secuencia al {usedPct}% — Solicita nueva autorización pronto
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <NewSequenceModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchSequences}
      />
    </div>
  );
}

// Tab 4: Notas Crédito/Débito
function NotasTab() {
  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        // Notes endpoint not yet built; use invoice list filtered by type 33/34
        const params = new URLSearchParams({ per_page: '50' });
        const types = filterType ? [filterType] : ['33', '34'];
        // Fetch both types
        const results = await Promise.all(
          types.map((t) =>
            fetch(`/api/v1/ecf?ecfType=${t}${filterStatus ? `&status=${filterStatus}` : ''}&per_page=50`)
              .then((r) => r.json())
              .then((d) => d.data || [])
          )
        );
        const combined = results.flat().sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNotes(combined as any);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [filterType, filterStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los tipos</option>
          <option value="33">e-33 Nota Débito</option>
          <option value="34">e-34 Nota Crédito</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="accepted">Aceptado</option>
          <option value="rejected">Rechazado</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} /></div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <CreditCard className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">No hay notas de crédito o débito</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCF Nota</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {notes.map((note: any) => (
                <tr key={note.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{note.ncf}</span>
                  </td>
                  <td className="px-4 py-3"><ECFTypeBadge type={note.ecfType} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    {formatCurrency(note.total)}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={note.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(note.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="h-4 w-4" /> },
  { id: 'cola', label: 'Cola DGII', icon: <Activity className="h-4 w-4" /> },
  { id: 'secuencias', label: 'Secuencias SACF', icon: <Database className="h-4 w-4" /> },
  { id: 'notas', label: 'Notas Crédito/Débito', icon: <CreditCard className="h-4 w-4" /> },
];

export default function ECFPage() {
  const [activeTab, setActiveTab] = useState('comprobantes');
  const [entorno, setEntorno] = useState<'TEST' | 'CERT' | 'PROD'>('TEST');

  useEffect(() => {
    // Detect entorno from company settings
    const fetchEntorno = async () => {
      try {
        const res = await fetch('/api/v1/company/settings');
        const data = await res.json();
        if (data.success) {
          const env = data.data?.dgiiEnv;
          if (env === 'production') setEntorno('PROD');
          else if (env === 'cert') setEntorno('CERT');
          else setEntorno('TEST');
        }
      } catch (err) {
        // silently fail
      }
    };
    fetchEntorno();
  }, []);

  const entornoConfig = {
    TEST: { label: 'ENTORNO DE PRUEBA', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
    CERT: { label: 'CERTIFICACIÓN', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
    PROD: { label: 'PRODUCCIÓN', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-700' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Comprobantes Fiscales e-CF</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gestión integral de facturación electrónica DGII</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${entornoConfig[entorno].color}`}>
          <ShieldCheck className="h-3 w-3" />
          {entornoConfig[entorno].label}
        </span>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-surface-bright text-primary shadow-sm border border-outline-variant/30'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'comprobantes' && <ComprobantesTab />}
          {activeTab === 'cola' && <ColaTab />}
          {activeTab === 'secuencias' && <SecuenciasTab />}
          {activeTab === 'notas' && <NotasTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
