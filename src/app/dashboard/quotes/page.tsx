'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, FileText, Check, Trash2, ListFilter,
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
    <div className="space-y-8 animate-fade-in-up pb-12 w-full max-w-none">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 w-full">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-[#c5a059] tracking-tight font-extrabold flex items-center gap-3">
            <FileText className="h-8 w-8 text-[#c5a059]" /> Cotizaciones
          </h1>
          <p className="font-body-lg text-slate-500 mt-1">
            Administre sus cotizaciones, ofertas a clientes y conviértalas directamente en facturas.
          </p>
        </div>

        {/* Tab Switcher & Action button */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="bg-slate-50 p-1 rounded-lg flex gap-1 border border-white/20">
            <button
              className="px-4 py-2 rounded-lg text-xs font-bold transition bg-white text-[#c5a059] shadow-sm"
            >
              <ListFilter className="h-4 w-4 inline mr-1.5" /> Historial
            </button>
            <button
              onClick={() => router.push('/dashboard/quotes/new')}
              className="px-4 py-2 rounded-lg text-xs font-bold transition text-slate-500 hover:text-slate-800"
            >
              <Plus className="h-4 w-4 inline mr-1.5" /> Registrar
            </button>
          </div>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
        {/* Stats Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-2">
          <div className="flex flex-col gap-2">
            <div className="mt-3 flex items-center gap-2 bg-[#003366]/5 border border-[#003366]/10 px-3 py-1.5 rounded-full w-fit">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-xs font-bold text-[#003366] uppercase tracking-wider">Gestión Comercial</span>
            </div>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Cotizado</span>
              <span className="block font-mono text-xl md:text-2xl font-bold text-[#003366]">
                RD$ {Number(stats.totalMonth).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#C5A059]" />
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pendientes</span>
              <span className="block font-mono text-xl md:text-2xl font-bold text-[#C5A059]">{stats.pending}</span>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row flex-wrap items-end gap-4 shadow-lg">
          <div className="flex-1 min-w-[200px] w-full">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rango de Fechas</label>
            <div className="relative">
              <input
                type="text"
                value="Mes Actual"
                disabled
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 opacity-70 cursor-not-allowed"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div className="w-full md:w-[180px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#003366] focus:ring-1 focus:ring-[#C5A059]/20 focus:border-[#C5A059] outline-none transition appearance-none"
            >
              <option value="">Todos los Estados</option>
              <option value="pending">Pendientes</option>
              <option value="invoiced">Facturadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>

          <div className="flex-1 min-w-[240px] w-full">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Buscar Cliente / No. Cotización</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: COT-2026-000001 o Cliente..."
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-1.5 text-xs text-[#003366] placeholder:text-slate-500 focus:ring-1 focus:ring-[#C5A059]/20 focus:border-[#C5A059] outline-none transition"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <button
            onClick={fetchQuotes}
            className="w-full md:w-auto bg-slate-200 text-[#003366] px-3 py-1.5 h-8 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors flex items-center justify-center gap-2 border border-slate-300"
          >
            <Filter className="h-4 w-4" />
            FILTRAR
          </button>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {/* Mobile View */}
          <div className="md:hidden flex flex-col divide-y divide-slate-100">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                <span className="text-slate-400 text-xs">Cargando cotizaciones...</span>
              </div>
            ) : filteredQuotes.length > 0 ? (
              filteredQuotes.map((quote) => {
                const badge = getStatusBadge(quote.status);
                return (
                  <div key={quote.id} className="flex flex-col p-4 bg-white hover:bg-slate-50 transition-colors gap-3">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs font-bold text-[#003366]">
                          {quote.sequenceNumber}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(quote.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      </div>
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[#003366] text-sm truncate">
                        {quote.customerName || 'Cliente General'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-100">
                      <span className="font-mono font-bold text-[#003366] text-sm">
                        RD$ {Number(quote.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="flex gap-1.5">
                        {quote.status === 'pending' && (
                          <button onClick={() => convertToInvoice(quote.id)} className="p-2 bg-slate-100 rounded text-emerald-600 hover:bg-emerald-50">
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => window.open(`/api/v1/quotes/${quote.id}/print`, '_blank')} className="p-2 bg-slate-100 rounded text-[#C5A059] hover:bg-[#C5A059]/10">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button onClick={() => router.push(`/dashboard/quotes/${quote.id}/edit`)} className="p-2 bg-slate-100 rounded text-[#003366] hover:bg-[#003366]/5">
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <span className="text-slate-400 text-xs">No se encontraron cotizaciones.</span>
              </div>
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">No. Cotización</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Monto Total</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C5A059]" />
                      Cargando cotizaciones...
                    </td>
                  </tr>
                ) : filteredQuotes.length > 0 ? (
                  filteredQuotes.map((quote) => {
                    const badge = getStatusBadge(quote.status);
                    return (
                      <tr
                        key={quote.id}
                        className="hover:bg-[#C5A059]/5 transition-colors group"
                      >
                        <td className="px-4 py-2.5 align-middle text-xs font-semibold text-slate-700">
                          {new Date(quote.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-2.5 align-middle">
                          <span className="font-mono text-xs font-bold text-[#003366] bg-[#003366]/5 px-2 py-0.5 rounded">
                            {quote.sequenceNumber}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-middle">
                          <div className="font-bold text-[#003366] text-xs">{quote.customerName || 'Cliente General'}</div>
                        </td>
                        <td className="px-4 py-2.5 align-middle text-right font-mono font-bold text-[#003366] text-xs">
                          RD$ {Number(quote.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 align-middle text-center">
                          <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-middle text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {quote.status === 'pending' && (
                              <button
                                onClick={() => convertToInvoice(quote.id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Convertir a Factura"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => window.open(`/api/v1/quotes/${quote.id}/print`, '_blank')}
                              className="p-1.5 text-[#C5A059] hover:bg-[#C5A059]/10 rounded-lg transition-colors"
                              title="Imprimir Cotización"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/quotes/${quote.id}/edit`)}
                              className="p-1.5 text-[#003366] hover:bg-[#003366]/5 rounded-lg transition-colors"
                              title="Ver / Editar"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                      No se encontraron cotizaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Toolbar */}
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500 font-medium">
              Mostrando <span className="font-bold text-slate-800">{filteredQuotes.length}</span> de <span className="font-bold text-slate-800">{totalRecords}</span> cotizaciones
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  type="button"
                  className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-xs text-slate-500 font-bold px-2">
                  Pág. {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  type="button"
                  className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

    </div>
  );
}
