'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, FileText, Check, Trash2,
  Calendar, Filter, Eye, Printer, Building2,
  Package, Users, RefreshCw, ChevronRight,
  ChevronLeft, ChevronsLeft, ChevronsRight, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function QuotesList() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<any[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'pending' | 'invoiced' | 'cancelled' | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [stats, setStats] = useState({ totalMonth: 0, pending: 0 });

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/v1/quotes', window.location.origin);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('per_page', '10');
      if (statusFilter) url.searchParams.set('status', statusFilter);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      
      if (data.success) {
        setQuotes(data.data || []);
        setTotalPages(data.meta?.totalPages || 1);
        setTotalRecords(data.meta?.total || 0);

        // Stats calculation from backend metadata
        setStats({
          totalMonth: data.meta?.stats?.totalAmount || 0,
          pending: data.meta?.stats?.pendingCount || 0
        });
      } else {
        toast.error('Error cargando cotizaciones', { description: data.error?.message });
      }
    } catch (error: any) {
      toast.error('Error de red', { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const convertToInvoice = async (quoteId: string) => {
    try {
      const res = await fetch(`/api/v1/quotes/${quoteId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Redirigiendo a facturación...', { description: 'Los datos han sido pre-cargados.' });
        router.push(`/dashboard/invoices?quoteId=${quoteId}`);
      } else {
        toast.error('Error al convertir', { description: data.error?.message });
      }
    } catch (error: any) {
      toast.error('Error de red', { description: error.message });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'PENDIENTE', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot: 'bg-amber-500' };
      case 'invoiced': return { label: 'FACTURADA', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dot: 'bg-emerald-500' };
      case 'cancelled': return { label: 'CANCELADA', cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20', dot: 'bg-rose-500' };
      default: return { label: status.toUpperCase(), cls: 'bg-slate-500/10 text-slate-500 border-slate-500/20', dot: 'bg-slate-500' };
    }
  };

  // Local Search Filtering
  const filteredQuotes = quotes.filter(quote => {
    const s = searchTerm.toLowerCase();
    return (
      quote.sequenceNumber?.toLowerCase().includes(s) ||
      (quote.customerName && quote.customerName.toLowerCase().includes(s)) ||
      String(quote.total).includes(s)
    );
  });

  return (
    <div className="pb-12 max-w-7xl mx-10 w-280">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
        {/* Header & Stats Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-2">
          <div>
            <nav className="flex items-center gap-2 text-on-surface-variant/80 font-medium text-xs mb-2">
              <span>Facturación</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-[#C5A059] font-bold">Cotizaciones</span>
            </nav>
            <h1 className="text-3xl md:text-4xl font-bold text-[#003366] tracking-tight">Cotizaciones y Ofertas</h1>
            <div className="mt-3 flex items-center gap-2 bg-[#003366]/5 border border-[#003366]/10 px-3 py-1.5 rounded-full w-fit">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-xs font-bold text-[#003366] uppercase tracking-wider">Gestión Comercial</span>
            </div>
            <p className="text-on-surface-variant/80 text-sm mt-1.5">Administre sus cotizaciones, ofertas a clientes y conviértalas directamente en facturas.</p>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none">
              <span className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1">Total Cotizado</span>
              <span className="block font-mono text-xl md:text-2xl font-bold text-[#003366]">
                RD$ {Number(stats.totalMonth).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#C5A059]" />
              <span className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1">Pendientes</span>
              <span className="block font-mono text-xl md:text-2xl font-bold text-[#C5A059]">{stats.pending}</span>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row flex-wrap items-end gap-4 shadow-lg">
          <div className="flex-1 min-w-[200px] w-full">
            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Rango de Fechas</label>
            <div className="relative">
              <input
                type="text"
                value="Mes Actual"
                disabled
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 opacity-70 cursor-not-allowed"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/80" />
            </div>
          </div>

          <div className="w-full md:w-[180px]">
            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-[#003366] focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all appearance-none"
            >
              <option value="">Todos los Estados</option>
              <option value="pending">Pendientes</option>
              <option value="invoiced">Facturadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>

          <div className="flex-1 min-w-[240px] w-full">
            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Buscar Cliente / No. Cotización</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: COT-2026-000001 o Cliente..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#003366] placeholder:text-on-surface-variant/80 focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
            </div>
          </div>

          <button
            onClick={fetchQuotes}
            className="w-full md:w-auto bg-slate-100 text-[#003366] px-6 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors h-[42px] flex items-center justify-center gap-2 border border-slate-300"
          >
            <Filter className="h-4 w-4" />
            FILTRAR
          </button>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Fecha</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">No. Cotización</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Monto Total</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">Estado</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20/80">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                        <span className="text-on-surface-variant/80 text-sm font-medium">Cargando cotizaciones...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredQuotes.length > 0 ? (
                  filteredQuotes.map((quote) => {
                    const badge = getStatusBadge(quote.status);
                    return (
                      <motion.tr
                        key={quote.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-[#C5A059]/5 transition-colors group"
                      >
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                          {new Date(quote.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs font-bold text-[#003366] bg-[#003366]/5 px-2 py-1 rounded">
                            {quote.sequenceNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#003366] text-xs">{quote.customerName || 'Cliente General'}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[#003366] text-xs">
                          RD$ {Number(quote.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {quote.status === 'pending' && (
                              <button
                                onClick={() => convertToInvoice(quote.id)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200"
                                title="Convertir a Factura"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/dashboard/quotes/${quote.id}/edit`)}
                              className="p-2 text-[#003366] hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                              title="Ver / Editar"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-sm">
                      No se encontraron cotizaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
              <span className="text-xs text-on-surface-variant/80">
                Mostrando página <strong className="text-[#003366]">{page}</strong> de <strong className="text-[#003366]">{totalPages}</strong> ({totalRecords} registros)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="p-2 text-[#003366] hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="p-2 text-[#003366] hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="p-2 text-[#003366] hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="p-2 text-[#003366] hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Floating Action Button for New Quote */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => router.push('/dashboard/quotes/new')}
        className="fixed bottom-8 right-8 md:bottom-12 md:right-12 w-14 h-14 bg-[#C5A059] text-slate-950 rounded-full shadow-xl shadow-[#C5A059]/20 flex items-center justify-center z-40"
        title="Nueva Cotización"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
