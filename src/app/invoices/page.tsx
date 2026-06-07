'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { Plus, Search, FileText, Download, Check, RefreshCw, X, Trash2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

function InvoicesList() {
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Form State
  const [ecfType, setEcfType] = useState('31'); // 31 (Fiscal), 32 (Consumo)
  const [paymentType, setPaymentType] = useState<'cash' | 'credit' | 'bank_transfer'>('cash');
  const [customerId, setCustomerId] = useState('');
  const [customerRnc, setCustomerRnc] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState<any[]>([
    { productId: 'f56a31c0-0000-0000-0000-000000000000', productName: 'Servicio de Consultoría Técnica', quantity: 1, unitPrice: 5000, discount: 0, taxRate: 0.18 },
  ]);

  // Load showForm from query parameter if present
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowForm(true);
    }
  }, [searchParams]);

  // Load Invoices
  const loadInvoices = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: '15',
      });
      if (statusFilter) queryParams.append('status', statusFilter);
      if (searchTerm) queryParams.append('ncf', searchTerm);

      const res = await fetch(`/api/v1/invoices?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setInvoices(data.data || []);
        setTotalPages(data.meta?.total_pages || 1);
      }
    } catch (error) {
      toast.error('Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [page, statusFilter, searchTerm]);

  // Totals calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let taxes = 0;

    lines.forEach((line) => {
      const lineSub = line.quantity * line.unitPrice;
      const lineDisc = line.quantity * line.discount;
      const taxable = lineSub - lineDisc;
      const taxAmount = taxable * line.taxRate;

      subtotal += lineSub;
      discount += lineDisc;
      taxes += taxAmount;
    });

    const total = subtotal - discount + taxes;
    return { subtotal, discount, taxes, total };
  };

  const { subtotal, discount, taxes, total } = calculateTotals();

  // Form Operations
  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        productId: 'f56a31c0-0000-0000-0000-000000000000',
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: 0.18,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const handleIssueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Validate customer if Fiscal (e-31)
      if (ecfType === '31' && (!customerRnc || !customerName)) {
        throw new Error('El RNC y la Razón Social del cliente son requeridos para facturas de Crédito Fiscal (e-31).');
      }

      // Check for empty line names
      if (lines.some((l) => !l.productName)) {
        throw new Error('Todos los artículos deben tener un nombre.');
      }

      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          ecfType,
          paymentType,
          lines,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al emitir factura.');
      }

      toast.success('Factura e-CF emitida y firmada', {
        description: `NCF asignado: ${data.data.ncf}`,
      });

      setShowForm(false);
      // Reset form
      setCustomerId('');
      setCustomerRnc('');
      setCustomerName('');
      setLines([{ productId: 'f56a31c0-0000-0000-0000-000000000000', productName: 'Servicio de Consultoría Técnica', quantity: 1, unitPrice: 5000, discount: 0, taxRate: 0.18 }]);
      loadInvoices();
    } catch (error: any) {
      toast.error('Error de emisión', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const viewInvoiceDetails = async (inv: any) => {
    try {
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedInvoice(data.data);
      }
    } catch (error) {
      toast.error('No se pudieron obtener los detalles de la factura.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
      {/* Navigation & Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
            <FileText className="h-7 w-7 text-amber-500" />
            Facturación Electrónica e-CF
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Consulte e-CFs emitidos, verifique estados de DGII y emita nuevos comprobantes.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
          >
            <Plus className="h-4 w-4" />
            Emitir Comprobante (e-CF)
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {showForm ? (
          // Form View
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-lg space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white uppercase tracking-wider">Nuevo Comprobante Electrónico</h3>
              <button
                onClick={() => setShowForm(false)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al Listado
              </button>
            </div>

            <form onSubmit={handleIssueInvoice} className="space-y-6">
              {/* General Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">Tipo de e-CF</label>
                  <select
                    value={ecfType}
                    onChange={(e) => setEcfType(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  >
                    <option value="31">e-31 Factura de Crédito Fiscal</option>
                    <option value="32">e-32 Factura de Consumo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">Método de Pago</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  >
                    <option value="cash">Efectivo / Caja</option>
                    <option value="credit">Crédito (A 30 días)</option>
                    <option value="bank_transfer">Transferencia Bancaria</option>
                  </select>
                </div>
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/40 p-6 rounded-lg border border-slate-800">
                <div className="col-span-1 md:col-span-2">
                  <h4 className="text-white font-semibold text-sm">Datos del Cliente</h4>
                  <p className="text-xs text-slate-500">Requerido para crédito fiscal (e-31)</p>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">RNC o Cédula</label>
                  <input
                    type="text"
                    value={customerRnc}
                    onChange={(e) => setCustomerRnc(e.target.value.replace(/\D/g, ''))}
                    className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    placeholder="131002002"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">Razón Social o Nombre</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    placeholder="Cliente Comercial S.A."
                  />
                </div>
              </div>

              {/* Item Lines */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-white font-semibold text-sm">Artículos de la Factura</h4>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-amber-500 font-semibold hover:text-amber-400 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar Fila
                  </button>
                </div>

                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row items-center gap-4 bg-slate-950/20 p-4 rounded-lg border border-slate-800">
                      <div className="flex-1 w-full space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Descripción</label>
                        <input
                          type="text"
                          value={line.productName}
                          onChange={(e) => handleLineChange(idx, 'productName', e.target.value)}
                          className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                          placeholder="Nombre del servicio o producto"
                          required
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Cant.</label>
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                          min={0.0001}
                          step="any"
                          required
                        />
                      </div>
                      <div className="w-32 space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">Precio Unit.</label>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => handleLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                          min={0}
                          required
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">ITBIS (Tasa)</label>
                        <select
                          value={line.taxRate}
                          onChange={(e) => handleLineChange(idx, 'taxRate', parseFloat(e.target.value))}
                          className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                        >
                          <option value="0.18">18% ITBIS</option>
                          <option value="0.16">16% ITBIS</option>
                          <option value="0.00">0% Exento</option>
                        </select>
                      </div>
                      <div className="w-8 flex items-center justify-center pt-5">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-rose-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculation Summary & Submit */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-t border-slate-800 pt-6">
                <div className="space-y-1.5 text-sm text-slate-300 w-full md:max-w-xs">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-white">RD$ {subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento:</span>
                    <span className="font-semibold text-white">RD$ {discount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Impuestos (ITBIS):</span>
                    <span className="font-semibold text-white">RD$ {taxes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 text-base font-bold">
                    <span className="text-white">Total General:</span>
                    <span className="text-amber-500">RD$ {total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-md border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-md bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-amber-500/5"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Firmando XML e-CF...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Emitir Comprobante
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        ) : (
          // Invoices List View
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4 shadow">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full rounded-md border-0 bg-slate-950 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm placeholder:text-slate-600"
                  placeholder="Buscar por NCF o e-CF..."
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border-0 bg-slate-950 py-2.5 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              >
                <option value="">Todos los Estados</option>
                <option value="signed">Firmado (Pendiente Envío)</option>
                <option value="submitted">Transmitido (En Cola)</option>
                <option value="accepted">Aceptado por DGII</option>
                <option value="rejected">Rechazado por DGII</option>
              </select>
            </div>

            {/* Data Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-6">Fecha Emisión</th>
                      <th className="py-4 px-6">NCF / Comprobante</th>
                      <th className="py-4 px-6">Tipo</th>
                      <th className="py-4 px-6">Estado</th>
                      <th className="py-4 px-6 text-right">Monto Total</th>
                      <th className="py-4 px-6 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
                            <span className="text-slate-400 text-sm">Cargando histórico e-CF...</span>
                          </div>
                        </td>
                      </tr>
                    ) : invoices.length > 0 ? (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-950/20 transition-colors">
                          <td className="py-4 px-6 text-slate-400">
                            {new Date(inv.createdAt).toLocaleDateString('es-DO')}
                          </td>
                          <td className="py-4 px-6 font-mono font-medium text-white">{inv.ncf}</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                              e-{inv.ecfType}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                inv.status === 'accepted' || inv.status === 'signed'
                                  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                  : inv.status === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right font-semibold text-white">
                            RD$ {parseFloat(inv.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => viewInvoiceDetails(inv)}
                                className="text-amber-500 hover:text-amber-400 text-xs font-semibold"
                              >
                                Detalles
                              </button>
                              <a
                                href={`/api/v1/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-white"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Ningún comprobante electrónico coincide con los criterios de búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/20 px-6 py-4">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="rounded border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-slate-400">Página {page} de {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                    className="rounded border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice Details Dialog Modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInvoice(null)}
              className="fixed inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-2xl w-full shadow-2xl z-10 text-slate-300 space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Detalles de Comprobante e-CF</h3>
                <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 uppercase font-semibold">NCF / Número Comprobante</span>
                  <p className="font-mono text-white text-sm mt-0.5">{selectedInvoice.ncf}</p>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold">Estado Transmisión</span>
                  <p className="text-amber-500 font-semibold text-sm uppercase mt-0.5">{selectedInvoice.status}</p>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold">Monto Subtotal</span>
                  <p className="text-white text-sm mt-0.5">RD$ {parseFloat(selectedInvoice.subtotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold">Impuestos ITBIS</span>
                  <p className="text-white text-sm mt-0.5">RD$ {parseFloat(selectedInvoice.totalTaxes).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="col-span-1 md:col-span-2 border-t border-slate-800 pt-3">
                  <span className="text-slate-500 uppercase font-semibold">Total Liquidado</span>
                  <p className="text-amber-500 font-bold text-lg">RD$ {parseFloat(selectedInvoice.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Lines Details */}
              <div className="space-y-2">
                <span className="text-slate-500 uppercase font-semibold text-xs">Detalle de Líneas</span>
                <div className="border border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/40 text-slate-400 uppercase">
                      <tr>
                        <th className="py-2 px-3">Descripción</th>
                        <th className="py-2 px-3 text-center">Cant.</th>
                        <th className="py-2 px-3 text-right">Precio Unit.</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedInvoice.lines?.map((line: any) => (
                        <tr key={line.id}>
                          <td className="py-2 px-3 text-white">{line.productName || 'Línea de servicio'}</td>
                          <td className="py-2 px-3 text-center">{parseFloat(line.quantity)}</td>
                          <td className="py-2 px-3 text-right">RD$ {parseFloat(line.unitPrice).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-semibold text-white">RD$ {parseFloat(line.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <a
                  href={`/api/v1/invoices/${selectedInvoice.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  <Download className="h-4 w-4" />
                  Descargar Representación PDF
                </a>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-slate-400 text-sm">Cargando módulo de facturación...</p>
          </div>
        </div>
      }
    >
      <InvoicesList />
    </Suspense>
  );
}
