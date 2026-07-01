'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Plus, Search, FileText, Check, RefreshCw, X, Trash2,
  ArrowLeft, Calendar, FileDown, Printer, ChevronLeft,
  ChevronRight, AlertCircle, Package, Truck, UserCheck, ShieldAlert, FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function DeliveryNotesPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);

  // Pagination & Filters for List
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  // Creation Flow
  const [showForm, setShowForm] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [driverName, setDriverName] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [dispatcherName, setDispatcherName] = useState('');
  const [notesText, setNotesText] = useState('');

  // Target Invoice
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [targetInvoice, setTargetInvoice] = useState<any>(null);

  // Line dispatches
  const [dispatchLines, setDispatchLines] = useState<any[]>([]);

  // Load Conduces List
  const loadDeliveryNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '15',
      });
      const res = await fetch(`/api/v1/delivery-notes?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setNotes(data.data || []);
        setTotalPages(data.meta?.total_pages || 1);
      } else {
        toast.error('Error al cargar conduces');
      }
    } catch (err) {
      toast.error('Error al cargar conduces');
    } finally {
      setLoading(false);
    }
  }, [page]);

  const handleApplyCode = async () => {
    if (!applyCode.trim()) {
      toast.error('Debe ingresar un código de factura o conduce.');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch('/api/v1/delivery-notes/apply-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: applyCode }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Código aplicado con éxito.');
        setApplyCode('');
        // Refresh delivery notes list
        loadDeliveryNotes();
      } else {
        toast.error(data.error?.message || 'Error al aplicar el código.');
      }
    } catch (error) {
      toast.error('Error de red al aplicar el código.');
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => {
    loadDeliveryNotes();
  }, [loadDeliveryNotes]);

  // Search for accepted invoices with pending or partial delivery status
  const handleSearchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      // Fetch current delivery notes to check for drafts
      const dRes = await fetch(`/api/v1/delivery-notes?per_page=100`);
      const dData = await dRes.json();
      const draftInvoiceIds = new Set<string>();
      if (dData.success) {
        (dData.data || []).forEach((dn: any) => {
          if (dn.status === 'draft') {
            draftInvoiceIds.add(dn.invoiceId);
          }
        });
      }

      // Fetch invoices (without forcing accepted status, we will filter in frontend to allow signed/submitted too)
      const res = await fetch(`/api/v1/ecf?q=${encodeURIComponent(invoiceSearchQuery)}&per_page=50`);
      const data = await res.json();
      if (data.success) {
        // Filter out credit notes (34) and check deliveryStatus, only show active invoices (accepted, signed, submitted)
        // Also exclude invoices that already have a draft delivery note
        const validInvoices = (data.data || []).filter(
          (inv: any) =>
            inv.ecfType !== '34' &&
            ['accepted', 'signed', 'submitted'].includes(inv.status) &&
            (inv.deliveryStatus === 'pending' || inv.deliveryStatus === 'partial') &&
            !draftInvoiceIds.has(inv.id)
        );
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
      toast.info('Cargando líneas y cantidades despachadas...');
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (data.success) {
        const fullInvoice = data.data;

        // Fetch already approved delivery notes to calculate delivered quantities
        const dRes = await fetch(`/api/v1/delivery-notes?per_page=100`);
        const dData = await dRes.json();
        const deliveredMap: Record<string, number> = {};

        if (dData.success) {
          const approvedNotes = (dData.data || []).filter(
            (dn: any) => dn.invoiceId === inv.id && dn.status === 'approved'
          );

          // Get detail lines for each approved note to sum up
          for (const an of approvedNotes) {
            const linesRes = await fetch(`/api/v1/delivery-notes/${an.id}`);
            const linesData = await linesRes.json();
            if (linesData.success && linesData.data?.lines) {
              for (const l of linesData.data.lines) {
                deliveredMap[l.productId] = (deliveredMap[l.productId] || 0) + Number(l.quantity);
              }
            }
          }
        }

        setTargetInvoice(fullInvoice);
        // Map lines
        const linesMap = fullInvoice.lines.map((l: any) => {
          const invQty = Number(l.quantity);
          const prevQty = deliveredMap[l.productId] || 0;
          const pendingQty = Math.max(0, invQty - prevQty);

          return {
            productId: l.productId,
            productName: l.productName,
            invoicedQty: invQty,
            previouslyDelivered: prevQty,
            pendingQty: pendingQty,
            quantity: pendingQty, // Default to dispatch all remaining
          };
        });

        setDispatchLines(linesMap);
        setShowInvoiceSearch(false);
        toast.success(`Factura ${inv.ncf} seleccionada.`);
      }
    } catch (err) {
      toast.error('Error al cargar los detalles de la factura.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice) {
      toast.error('Debe seleccionar una factura de referencia.');
      return;
    }
    if (dispatchLines.every((l) => l.quantity <= 0)) {
      toast.error('Debe despachar una cantidad mayor a cero en al menos un producto.');
      return;
    }

    // Verify limit validation
    for (const line of dispatchLines) {
      if (line.quantity > line.pendingQty) {
        toast.error(`No puede despachar más de la cantidad pendiente para: ${line.productName}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        invoiceId: targetInvoice.id,
        deliveryDate,
        driverName,
        driverLicense,
        vehiclePlate,
        dispatcherName,
        notes: notesText,
        lines: dispatchLines
          .filter((l) => l.quantity > 0)
          .map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
      };

      const res = await fetch('/api/v1/delivery-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar conduce.');
      }

      toast.success('Borrador de conduce creado correctamente.', {
        description: `Código: ${data.data.deliveryNumber}`,
      });

      // Reset Form State
      setShowForm(false);
      setTargetInvoice(null);
      setDispatchLines([]);
      setDriverName('');
      setDriverLicense('');
      setVehiclePlate('');
      setDispatcherName('');
      setNotesText('');
      loadDeliveryNotes();
    } catch (err: any) {
      toast.error('Error al crear conduce', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Approve Conduce (Exits stock)
  const handleApproveNote = async (noteId: string) => {
    if (!confirm('¿Está seguro de que desea aprobar este conduce? Esta acción descontará el inventario físico y cambiará el estado de la factura.')) {
      return;
    }
    try {
      toast.loading('Aprobando y procesando despacho...');
      const res = await fetch(`/api/v1/delivery-notes/${noteId}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      toast.dismiss();

      if (data.success) {
        toast.success(data.message || 'Conduce aprobado correctamente.');
        loadDeliveryNotes();
      } else {
        toast.error(data.error?.message || 'Error al aprobar conduce.');
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error('Error de red', { description: err.message });
    }
  };

  // Void Conduce (Returns stock)
  const handleVoidNote = async (noteId: string) => {
    if (!confirm('¿Está seguro de que desea anular este conduce? Esta acción retornará la mercancía al inventario y revertirá el estado logístico.')) {
      return;
    }
    try {
      toast.loading('Anulando conduce y retornando stock...');
      const res = await fetch(`/api/v1/delivery-notes/${noteId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      toast.dismiss();

      if (data.success) {
        toast.success(data.message || 'Conduce anulado correctamente.');
        loadDeliveryNotes();
      } else {
        toast.error(data.error?.message || 'Error al anular conduce.');
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error('Error de red', { description: err.message });
    }
  };

  const handlePrintNote = (noteId: string) => {
    window.open(`/api/v1/delivery-notes/${noteId}/print`, '_blank');
  };

  return (
    <>
      <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
        {/* Header Ribbon */}
        <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
          <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
            <Truck className="h-3 w-3" /> Control de Despacho Logístico (WMS)
          </span>
        </div>

        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
          <AnimatePresence mode="wait">
            {!showForm ? (
              /* LIST VIEW */
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
                      Conduces de Entrega
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                      Controle la salida física de mercancías asociadas a facturas de venta.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowForm(true)}
                    className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm"
                  >
                    <Plus className="h-4 w-4" /> Nuevo Conduce
                  </button>
                </div>

                {/* Quick Action: Apply Delivery Note or Invoice Stock Deduction */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#c5a059]/10 p-3 rounded-lg text-[#c5a059]">
                      <Truck className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-md font-bold text-slate-900">Aplicar Despacho por Código</h3>
                      <p className="text-xs text-slate-500">Digita el NCF de la factura o el código de conduce para aprobar y descontar stock automáticamente.</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch md:items-center w-full md:w-auto">
                    <input
                      type="text"
                      placeholder="Ej: E310000000001 o CON-2026-000001"
                      value={applyCode}
                      onChange={(e) => setApplyCode(e.target.value)}
                      className="bg-white border border-slate-350 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-[#003366] focus:border-transparent outline-none w-full sm:w-80 font-mono"
                    />
                    <button
                      onClick={handleApplyCode}
                      disabled={applying}
                      className="bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm shrink-0 disabled:opacity-50"
                    >
                      {applying ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileCheck className="h-4 w-4" />
                      )}
                      <span>Aplicar Despacho</span>
                    </button>
                  </div>
                </div>

                {/* Table list */}
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                  {loading ? (
                    <div className="flex justify-center py-16">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
                      <Truck className="h-12 w-12 opacity-30" />
                      <span className="text-sm">No se encontraron conduces registrados.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50/80 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Número</th>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fecha Entrega</th>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chofer</th>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Placa</th>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {notes.map((note) => (
                            <tr key={note.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                              <td className="px-4 py-2 align-middle text-xs font-mono font-bold text-slate-800">
                                {note.deliveryNumber}
                              </td>
                              <td className="px-4 py-2 align-middle text-xs text-slate-650">
                                {new Date(note.deliveryDate + 'T00:00:00').toLocaleDateString('es-DO')}
                              </td>
                              <td className="px-4 py-2 align-middle text-xs text-slate-700 font-semibold">
                                {note.driverName || 'N/A'}
                              </td>
                              <td className="px-4 py-2 align-middle text-xs font-mono text-slate-500">
                                {note.vehiclePlate || 'N/A'}
                              </td>
                              <td className="px-4 py-2 align-middle text-center">
                                <span
                                  className={clsx(
                                    "inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded border",
                                    note.status === 'approved' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                                    note.status === 'draft' && "bg-amber-50 text-amber-700 border-amber-100",
                                    note.status === 'voided' && "bg-rose-50 text-rose-700 border-rose-100"
                                  )}
                                >
                                  {note.status === 'approved' ? 'Despachado' : note.status === 'draft' ? 'Borrador' : 'Anulado'}
                                </span>
                              </td>
                              <td className="px-4 py-2 align-middle text-right">
                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handlePrintNote(note.id)}
                                    className="p-1.5 hover:bg-slate-50 rounded text-slate-600 transition-colors"
                                    title="Imprimir Conduce"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                  {note.status === 'draft' && (
                                    <>
                                      <button
                                        onClick={() => handleApproveNote(note.id)}
                                        className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600 transition-colors"
                                        title="Aprobar y Despachar Inventario"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleVoidNote(note.id)}
                                        className="p-1.5 hover:bg-rose-50 rounded text-rose-600 transition-colors"
                                        title="Eliminar Borrador"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  {note.status === 'approved' && (
                                    <button
                                      onClick={() => handleVoidNote(note.id)}
                                      className="p-1.5 hover:bg-rose-50 rounded text-rose-600 transition-colors"
                                      title="Anular y Revertir Inventario"
                                    >
                                      <ShieldAlert className="h-4 w-4" />
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

                  {/* Pagination Toolbar */}
                  <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <p className="text-xs text-slate-500 font-medium">
                      Mostrando <span className="font-bold text-slate-800">{notes.length}</span> conduces
                    </p>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                          type="button"
                          className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                          className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* CREATION FLOW */
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setTargetInvoice(null);
                      setDispatchLines([]);
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-[#C5A059] hover:underline mb-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Volver al listado
                  </button>
                  <h2 className="text-2xl font-bold text-[#003366]">Nuevo Conduce de Entrega</h2>
                  <p className="text-slate-500 text-sm">Registre un nuevo despacho de mercancías sobre una factura existente.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Select Invoice & Driver */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2 flex flex-col justify-end">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Factura Relacionada</label>
                        {targetInvoice ? (
                          <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50/50 rounded-xl px-4 py-2.5">
                            <div>
                              <div className="text-xs font-bold text-emerald-800 font-mono">NCF: {targetInvoice.ncf}</div>
                              <div className="text-[11px] text-slate-500">{targetInvoice.buyerName || 'Consumidor Final'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTargetInvoice(null);
                                setDispatchLines([]);
                              }}
                              className="text-xs text-rose-600 font-bold hover:underline"
                            >
                              Cambiar Factura
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setShowInvoiceSearch(true);
                              handleSearchInvoices();
                            }}
                            className="w-full border border-[#003366] text-[#003366] hover:bg-[#003366]/5 rounded-xl py-3 px-4 font-bold text-sm transition-colors text-center"
                          >
                            Vincular Factura Afectada
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Fecha de Despacho</label>
                        <input
                          type="date"
                          required
                          value={deliveryDate}
                          onChange={(e) => setDeliveryDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-900 focus:border-[#C5A059] focus:bg-white transition-all font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Nombre del Chofer</label>
                        <input
                          type="text"
                          placeholder="Ej. Juan Pérez"
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#003366] focus:bg-white text-slate-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Licencia Chofer</label>
                        <input
                          type="text"
                          placeholder="001-0000000-0"
                          value={driverLicense}
                          onChange={(e) => setDriverLicense(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#003366] focus:bg-white text-slate-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Placa del Vehículo</label>
                        <input
                          type="text"
                          placeholder="L123456"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#003366] focus:bg-white text-slate-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Responsable Despacho</label>
                        <input
                          type="text"
                          placeholder="Firma autorizada"
                          value={dispatcherName}
                          onChange={(e) => setDispatcherName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#003366] focus:bg-white text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Line dispatch checklist */}
                  {targetInvoice && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
                        <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#003366]" /> Líneas de Despacho Físico
                        </span>
                      </div>
                      <div className="p-6">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-slate-500 font-semibold border-b border-slate-100 text-xs uppercase">
                                <th className="pb-3 text-left">Artículo / Servicio</th>
                                <th className="pb-3 text-center">Facturado</th>
                                <th className="pb-3 text-center">Entregado Ant.</th>
                                <th className="pb-3 text-center">Pendiente</th>
                                <th className="pb-3 text-center">Despachar Hoy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dispatchLines.map((line, idx) => (
                                <tr key={`${line.productId}-${idx}`} className="group">
                                  <td className="py-4 font-medium text-slate-800">{line.productName}</td>
                                  <td className="py-4 text-center text-slate-500 font-semibold">{line.invoicedQty}</td>
                                  <td className="py-4 text-center text-slate-500 font-semibold">{line.previouslyDelivered}</td>
                                  <td className="py-4 text-center text-indigo-600 font-bold">{line.pendingQty}</td>
                                  <td className="py-4 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max={line.pendingQty}
                                      value={line.quantity}
                                      onChange={(e) => {
                                        const val = Math.min(Number(e.target.value), line.pendingQty);
                                        const updated = [...dispatchLines];
                                        updated[idx].quantity = val;
                                        setDispatchLines(updated);
                                      }}
                                      className="w-20 text-center border border-slate-300 rounded px-1.5 py-1 text-sm font-semibold outline-none focus:border-[#003366] bg-white text-slate-900"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Notes / Observaciones */}
                        <div className="border-t border-slate-100 pt-6 mt-6">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Observaciones Contables / Notas de Entrega</label>
                          <textarea
                            rows={3}
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Ingrese notas particulares del chofer, dirección detallada, condiciones de la mercancía, etc."
                            className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:border-[#C5A059] text-sm text-slate-900 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Form Actions */}
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setTargetInvoice(null);
                        setDispatchLines([]);
                      }}
                      className="border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold py-2.5 px-6 rounded-lg text-sm transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !targetInvoice}
                      className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-8 rounded-lg shadow-md transition-all flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Registrar Conduce
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* MODAL: Invoice Search Popup */}
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
                  <FileText className="w-5 h-5 text-[#C5A059]" /> Buscar Facturas Pendientes de Despacho
                </h3>
                <button
                  onClick={() => setShowInvoiceSearch(false)}
                  className="hover:bg-white/10 p-1.5 rounded-full transition-colors"
                >
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
                    <div className="flex justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                    </div>
                  ) : invoicesList.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm">
                      Busque facturas aceptadas con despachos pendientes (e-31, e-32, e-45).
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
