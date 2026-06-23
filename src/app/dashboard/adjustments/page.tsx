'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Plus, Search, FileText, Download, Check, RefreshCw, X, Trash2,
  ArrowLeft, Calendar, Filter, Eye, Printer, XCircle, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, Building2, Mail,
  Package, Users, FileMinus, FilePlus, ArrowUpRight, ArrowDownLeft, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { SearchBar } from '@/components/ui/search-bar';

export default function AdjustmentsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any>(null);

  // Pagination & Filters for List
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);

  // New Note Form Flow
  const [showForm, setShowForm] = useState(false);
  const [noteType, setNoteType] = useState<'33' | '34'>('34'); // 34=Crédito, 33=Débito
  const [notesText, setNotesText] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Original Invoice Selector
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [targetInvoice, setTargetInvoice] = useState<any>(null);

  // Line adjustments
  const [adjustedLines, setAdjustedLines] = useState<any[]>([]);
  const [indicadorNotaCredito, setIndicadorNotaCredito] = useState<number>(0); // 0=sin seleccionar, 1=Anulación, 2=Texto, 3=Montos

  // Load adjustments list
  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '15',
        ecfType: typeFilter || '',
        q: searchTerm || ''
      });
      // Notes are stored in invoices table with type 33/34
      const res = await fetch(`/api/v1/ecf?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        // Filter list for only 33 and 34 to be secure
        const filtered = data.data.filter((d: any) => d.ecfType === '33' || d.ecfType === '34');
        setNotes(filtered);
        setTotalPages(data.meta?.total_pages || 1);
      }
    } catch (err) {
      toast.error('Error al cargar notas de ajuste.');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, searchTerm]);

  useEffect(() => {
    loadAdjustments();
  }, [loadAdjustments]);

  const handleRefreshStatus = async (note: any) => {
    setRefreshingId(note.id);
    try {
      const res = await fetch(`/api/v1/ecf/${note.id}/dgii-status`);
      const data = await res.json();
      if (data.success) {
        toast.success(`Estado actualizado: ${data.data.dgiiStatus || data.data.status}`);
        loadAdjustments();
      } else {
        toast.error(data.error?.message || 'Error al consultar estado');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleResubmit = async (note: any) => {
    setResubmittingId(note.id);
    try {
      const res = await fetch(`/api/v1/ecf/${note.id}/resubmit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Reenvío encolado exitosamente.');
        loadAdjustments();
      } else {
        toast.error(data.error?.message || 'Error al reenviar');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResubmittingId(null);
    }
  };

  // Load warehouses for creation
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await fetch('/api/v1/warehouses');
        const data = await res.json();
        if (data.success) {
          setWarehouses(data.data || []);
        }
      } catch (err) {
        console.error('Error loading warehouses', err);
      }
    };
    fetchWarehouses();
  }, []);

  // Fetch accepted invoices for reference selection
  const handleSearchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetch(`/api/v1/ecf?q=${encodeURIComponent(invoiceSearchQuery)}&status=accepted&excludeAdjusted=true&per_page=30`);
      const data = await res.json();
      if (data.success) {
        // Standard invoices e-31, e-32, e-45
        const validInvoices = data.data.filter((inv: any) => inv.ecfType === '31' || inv.ecfType === '32' || inv.ecfType === '45');
        setInvoicesList(validInvoices);
      }
    } catch (err) {
      toast.error('Error al buscar facturas.');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleSelectInvoice = async (inv: any) => {
    try {
      toast.info('Cargando líneas del e-CF original...');
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (data.success) {
        const fullInvoice = data.data;
        setTargetInvoice(fullInvoice);
        setWarehouseId(fullInvoice.warehouseId || '');
        // Map original lines to adjustment model
        const linesMap = fullInvoice.lines.map((l: any) => ({
          productId: l.productId,
          productName: l.productName,
          originalQty: Number(l.quantity),
          // Default to return 0, user will increment
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          discount: Number(l.discount || 0),
          taxRate: Number(l.taxRate || 0.18),
        }));
        setAdjustedLines(linesMap);
        setIndicadorNotaCredito(0); // Force explicit selection each time
        setShowInvoiceSearch(false);
        toast.success(`e-CF ${inv.ncf} seleccionado como referencia.`);
      }
    } catch (err) {
      toast.error('Error al cargar la factura original.');
    }
  };

  // Calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxes = 0;

    adjustedLines.forEach(l => {
      const lineSubtotal = l.quantity * l.unitPrice;
      const lineDiscount = l.quantity * l.discount;
      const taxable = lineSubtotal - lineDiscount;
      const tax = taxable * l.taxRate;

      subtotal += lineSubtotal;
      totalDiscount += lineDiscount;
      totalTaxes += tax;
    });

    const total = subtotal - totalDiscount + totalTaxes;
    return { subtotal, discount: totalDiscount, taxes: totalTaxes, total };
  };

  const { subtotal, discount, taxes, total } = calculateTotals();

  // Issue Adjustment Note
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice) {
      toast.error('Debe seleccionar una factura de referencia.');
      return;
    }
    if (!notesText.trim()) {
      toast.error('Debe ingresar un motivo / observación para la auditoría contable.');
      return;
    }
    // Validate indicadorNotaCredito is explicitly selected
    const validIndicadores = noteType === '34' ? [1, 2, 3] : [1, 2, 3, 4];
    if (!validIndicadores.includes(indicadorNotaCredito)) {
      toast.error('Debe seleccionar el Motivo / Tipo de Ajuste antes de emitir la nota.');
      return;
    }
    if (adjustedLines.every(l => l.quantity <= 0)) {
      toast.error('La cantidad a ajustar debe ser mayor a cero en al menos un artículo.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: targetInvoice.customerId || undefined,
        warehouseId,
        ecfType: noteType,
        paymentType: targetInvoice.paymentType || 'cash',
        bankName: targetInvoice.bankName || undefined,
        transactionNumber: targetInvoice.transactionNumber || undefined,
        notes: notesText,
        modifiedNcf: targetInvoice.ncf,
        modifiedInvoiceId: targetInvoice.id,
        buyerRnc: targetInvoice.buyerRnc || undefined,
        buyerName: targetInvoice.buyerName || undefined,
        indicadorNotaCredito: indicadorNotaCredito,
        lines: adjustedLines
          .filter(l => l.quantity > 0)
          .map(l => ({
            productId: l.productId,
            productName: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            taxRate: l.taxRate
          }))
      };

      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al emitir la nota de ajuste.');
      }

      toast.success(`Nota de ${noteType === '34' ? 'Crédito' : 'Débito'} emitida con éxito`, {
        description: `Comprobante e-CF: ${data.data.ncf}`
      });

      // Clear state
      setShowForm(false);
      setTargetInvoice(null);
      setAdjustedLines([]);
      setNotesText('');
      loadAdjustments();
    } catch (err: any) {
      toast.error('Error de emisión', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = (note: any) => {
    window.open(`/api/v1/invoices/${note.id}/pdf`, '_blank');
  };

  return (
    <>

    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      {/* Header Ribbon */}
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <FileMinus className="h-3 w-3" /> Crédito / Débito (Ajustes de e-CF)
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <AnimatePresence mode="wait">
          {!showForm ? (
            /* ==============================================================================
               LIST VIEW
               ============================================================================== */
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
                    Notas de Crédito / Débito
                  </h1>
                  <p className="text-on-surface-variant/80 text-sm mt-1">
                    Gestión independiente de notas de ajuste y modificaciones de comprobantes (e-33 y e-34).
                  </p>
                </div>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm"
                >
                  <Plus className="h-4 w-4" /> Crédito/Débito
                </button>
              </div>

              {/* Filters Row */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="w-[180px]">
                    <select
                      value={typeFilter}
                      onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-[#003366] outline-none"
                    >
                      <option value="">Todos los Tipos</option>
                      <option value="33">Nota de Débito (33)</option>
                      <option value="34">Nota de Crédito (34)</option>
                    </select>
                  </div>
                  <div className="w-full max-w-xs">
                    <SearchBar
                      placeholder="Buscar por NCF..."
                      value={searchTerm}
                      onChange={(val) => { setSearchTerm(val); setPage(1); }}
                    />
                  </div>
                </div>
              </div>

              {/* Adjustments Table */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                  <div className="flex justify-center py-16"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
                ) : notes.length === 0 ? (
                  <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
                    <FileMinus className="h-12 w-12 opacity-30" />
                    <span className="text-sm">No se encontraron notas de ajuste.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
                          <th className="px-6 py-4 text-left">eNCF Nota</th>
                          <th className="px-6 py-4 text-left">eNCF Afectado</th>
                          <th className="px-6 py-4 text-left">Tipo</th>
                          <th className="px-6 py-4 text-left">Cliente</th>
                          <th className="px-6 py-4 text-right">Monto</th>
                          <th className="px-6 py-4 text-center">Estado</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {notes.map((note) => (
                          <tr key={note.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4 font-mono font-bold text-slate-800 text-xs">
                              {note.ncf}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs">
                              {note.modifiedNcf ? (
                                <Link
                                  href={`/dashboard/invoices/${note.modifiedInvoiceId}`}
                                  className="text-[#003366] hover:text-[#C5A059] hover:underline font-bold"
                                >
                                  {note.modifiedNcf}
                                </Link>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={clsx(
                                "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border",
                                note.ecfType === '34' ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-blue-50 border-blue-100 text-blue-600"
                              )}>
                                {note.ecfType === '34' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                {note.ecfType === '34' ? 'Crédito (34)' : 'Débito (33)'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-800">{note.buyerName || 'Consumidor Final'}</div>
                              <div className="text-xs text-slate-500">{note.buyerRnc || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-[#003366]">
                              RD$ {Number(note.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={clsx(
                                  "inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border",
                                  note.status === 'accepted' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                                  note.status === 'rejected' && "bg-rose-50 text-rose-700 border-rose-100",
                                  note.status === 'signed' && "bg-amber-50 text-amber-700 border-amber-100"
                                )}>
                                  {note.status === 'accepted' ? 'Aceptado DGII' : note.status.toUpperCase()}
                                </span>
                                {note.dgiiMessage && (
                                  <span className={clsx(
                                    "text-[10px] font-semibold max-w-[150px] truncate",
                                    note.status === 'rejected' ? "text-rose-600" : "text-emerald-600"
                                  )} title={note.dgiiMessage}>
                                    {note.dgiiMessage}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleDownloadPdf(note)}
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors animate-fade-in"
                                  title="Imprimir PDF"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRefreshStatus(note)}
                                  disabled={refreshingId === note.id}
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors disabled:opacity-40"
                                  title="Consultar estado DGII"
                                >
                                  <RefreshCw className={clsx("h-4 w-4", refreshingId === note.id && "animate-spin")} />
                                </button>
                                {['rejected', 'failed'].includes(note.status) && (
                                  <button
                                    type="button"
                                    onClick={() => handleResubmit(note)}
                                    disabled={resubmittingId === note.id}
                                    className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors disabled:opacity-40"
                                    title="Reenviar a DGII"
                                  >
                                    <ArrowRight className={clsx("h-4 w-4", resubmittingId === note.id && "animate-pulse")} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Footer */}
                {totalPages > 1 && (
                  <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50/50">
                    <span className="text-xs text-slate-500">Página {page} de {totalPages}</span>
                    <div className="flex gap-2">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(p - 1, 1))}
                        className="p-2 border border-slate-200 rounded-lg bg-white disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        disabled={page === totalPages}
                        onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                        className="p-2 border border-slate-200 rounded-lg bg-white disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ==============================================================================
               CREATION FLOW (Crédito/Débito)
               ============================================================================== */
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div>
                <button
                  onClick={() => { setShowForm(false); setTargetInvoice(null); setAdjustedLines([]); }}
                  className="flex items-center gap-1 text-xs font-semibold text-[#C5A059] hover:underline mb-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver al listado
                </button>
                <h2 className="text-2xl font-bold text-[#003366] tracking-tight">Emisión de Crédito/Débito</h2>
                <p className="text-slate-500 text-sm">Registre un ajuste fiscal sobre un comprobante emitido previamente.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Select Note Type & Target Invoice */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Tipo de Comprobante de Ajuste</label>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => { setNoteType('34'); setIndicadorNotaCredito(0); }}
                          className={clsx(
                            "flex-1 py-3 px-4 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2",
                            noteType === '34' ? "bg-rose-50 border-rose-300 text-rose-700 shadow-sm" : "bg-white border-slate-200 text-slate-600"
                          )}
                        >
                          <FileMinus className="w-4 h-4" /> Nota de Crédito (34)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setNoteType('33'); setIndicadorNotaCredito(0); }}
                          className={clsx(
                            "flex-1 py-3 px-4 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2",
                            noteType === '33' ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm" : "bg-white border-slate-200 text-slate-600"
                          )}
                        >
                          <FilePlus className="w-4 h-4" /> Nota de Débito (33)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 flex flex-col justify-end">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Comprobante de Referencia (Afectado)</label>
                      {targetInvoice ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50/50 rounded-xl px-4 py-2.5">
                            <div>
                              <div className="text-xs font-bold text-emerald-800 font-mono">eNCF: {targetInvoice.ncf}</div>
                              <div className="text-[11px] text-slate-500">{targetInvoice.buyerName || 'Consumidor Final'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setTargetInvoice(null); setAdjustedLines([]); }}
                              className="text-xs text-rose-600 font-bold hover:underline"
                            >
                              Cambiar
                            </button>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                              Motivo / Tipo de Ajuste
                              <span className="text-rose-500 font-bold">*</span>
                            </label>
                            {noteType === '34' ? (
                              <select
                                value={indicadorNotaCredito}
                                onChange={(e) => setIndicadorNotaCredito(Number(e.target.value))}
                                required
                                className={clsx(
                                  "w-full rounded-lg bg-white border py-1.5 px-2.5 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-xs transition-all",
                                  indicadorNotaCredito === 0 ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                                )}
                              >
                                <option value={0} disabled>— Seleccione el motivo —</option>
                                <option value={1}>1 - Anulación completa</option>
                                <option value={2}>2 - Corrección de texto</option>
                                <option value={3}>3 - Corrección de montos / Ajuste parcial</option>
                              </select>
                            ) : (
                              <select
                                value={indicadorNotaCredito}
                                onChange={(e) => setIndicadorNotaCredito(Number(e.target.value))}
                                required
                                className={clsx(
                                  "w-full rounded-lg bg-white border py-1.5 px-2.5 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-xs transition-all",
                                  indicadorNotaCredito === 0 ? "border-rose-400 bg-rose-50/30" : "border-slate-300"
                                )}
                              >
                                <option value={0} disabled>— Seleccione el motivo —</option>
                                <option value={1}>1 - Intereses</option>
                                <option value={2}>2 - Gastos de cobranzas</option>
                                <option value={3}>3 - Gastos de facturación</option>
                                <option value={4}>4 - Otros</option>
                              </select>
                            )}
                            {indicadorNotaCredito === 0 && (
                              <p className="mt-1 text-[10px] text-rose-500 font-semibold flex items-center gap-1">
                                <span>⚠</span> Campo obligatorio
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setShowInvoiceSearch(true); handleSearchInvoices(); }}
                          className="w-full border border-[#003366] text-[#003366] hover:bg-[#003366]/5 rounded-xl py-3 px-4 font-bold text-sm transition-colors text-center"
                        >
                          Vincular Factura Afectada
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Line adjustments */}
                {targetInvoice && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#003366]" /> Desglose de Líneas de Ajuste
                      </span>
                      <span className="text-xs text-slate-500 font-medium">Factura: {targetInvoice.ncf}</span>
                    </div>
                    <div className="p-6">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-500 font-semibold border-b border-slate-100 text-xs uppercase">
                              <th className="pb-3 text-left">Artículo / Servicio</th>
                              <th className="pb-3 text-center">Cant. Original</th>
                              <th className="pb-3 text-center">Cant. Ajuste</th>
                              <th className="pb-3 text-right">Precio Unit.</th>
                              <th className="pb-3 text-right">Descuento</th>
                              <th className="pb-3 text-right">Impuesto (ITBIS)</th>
                              <th className="pb-3 text-right">Total Ajuste</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {adjustedLines.map((line, idx) => {
                              const lineSubtotal = line.quantity * line.unitPrice;
                              const lineDiscount = line.quantity * line.discount;
                              const lineTotal = (lineSubtotal - lineDiscount) * (1 + line.taxRate);

                              return (
                                <tr key={idx} className="group">
                                  <td className="py-4 font-medium text-slate-800">
                                    {line.productName}
                                  </td>
                                  <td className="py-4 text-center text-slate-500 font-semibold">
                                    {line.originalQty}
                                  </td>
                                  <td className="py-4 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max={line.originalQty}
                                      value={line.quantity}
                                      onChange={(e) => {
                                        const val = Math.min(Number(e.target.value), line.originalQty);
                                        const updated = [...adjustedLines];
                                        updated[idx].quantity = val;
                                        setAdjustedLines(updated);
                                      }}
                                      className="w-16 text-center border border-slate-300 rounded px-1.5 py-1 text-sm font-semibold outline-none focus:border-[#003366] bg-white text-slate-900"
                                    />
                                  </td>
                                  <td className="py-4 text-right font-mono text-slate-600">
                                    RD$ {line.unitPrice.toFixed(2)}
                                  </td>
                                  <td className="py-4 text-right font-mono text-slate-600">
                                    RD$ {line.discount.toFixed(2)}
                                  </td>
                                  <td className="py-4 text-right text-slate-500 font-medium">
                                    {(line.taxRate * 100).toFixed(0)}%
                                  </td>
                                  <td className="py-4 text-right font-mono font-bold text-slate-800">
                                    RD$ {lineTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Audit Details / Motivacion */}
                      <div className="border-t border-slate-100 pt-6 mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-2">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Motivo de la Modificación / Auditoría Contable</label>
                          <textarea
                            rows={3}
                            required
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Ej. Devolución parcial por inconformidad del cliente. Error técnico de digitación en precio..."
                            className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:border-[#C5A059] text-sm text-slate-900 bg-white"
                          />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Subtotal</span>
                            <span className="font-mono font-semibold">RD$ {subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Descuento</span>
                            <span className="font-mono font-semibold">RD$ {discount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>ITBIS (18%)</span>
                            <span className="font-mono font-semibold">RD$ {taxes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="border-t border-slate-200 pt-3 flex justify-between text-sm font-bold text-[#003366]">
                            <span>Total Nota</span>
                            <span className="font-mono text-base">RD$ {total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setTargetInvoice(null); setAdjustedLines([]); }}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold py-2.5 px-6 rounded-lg text-sm transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !targetInvoice}
                    className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-8 rounded-lg shadow-md transition-all flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Emitir Nota
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

      {/* MODAL: Invoice search popup */ }
  <AnimatePresence>
    {showInvoiceSearch && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full overflow-hidden"
        >
          <div className="bg-[#003366] text-white px-6 py-4 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-[#C5A059]" /> Vincular Factura Afectada
            </h3>
            <button onClick={() => setShowInvoiceSearch(false)} className="hover:bg-white/10 p-1.5 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Búsqueda por NCF, Cliente o RNC..."
                value={invoiceSearchQuery}
                onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-900 focus:border-[#C5A059] focus:bg-white transition-all"
              />
              <button
                onClick={handleSearchInvoices}
                className="bg-[#003366] text-white rounded-xl px-5 py-2.5 font-semibold text-sm hover:bg-[#002244] transition-colors"
              >
                Buscar
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {invoicesLoading ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" /></div>
              ) : invoicesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Realice una búsqueda para cargar facturas aceptadas por la DGII.
                </div>
              ) : (
                invoicesList.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => handleSelectInvoice(inv)}
                    className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center cursor-pointer group"
                  >
                    <div>
                      <div className="font-mono font-bold text-xs text-[#003366]">{inv.ncf}</div>
                      <div className="text-xs font-semibold text-slate-800">{inv.buyerName || 'Consumidor Final'}</div>
                      <div className="text-[10px] text-slate-500">Monto: RD$ {Number(inv.total).toLocaleString('es-DO')}</div>
                    </div>
                    <span className="text-xs font-bold text-[#C5A059] group-hover:underline flex items-center gap-1">
                      Vincular <Check className="w-3.5 h-3.5" />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
    </>
    
  );
}
