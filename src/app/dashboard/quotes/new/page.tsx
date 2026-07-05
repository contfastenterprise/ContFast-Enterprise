'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Save, X, Trash2, ArrowLeft,
  Building2, Package, Check, FileText, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function NewQuote() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  
  // App state
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Form state
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<any[]>([
    {
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      taxRate: 0.18,
      priceTier: 'consumidor',
      productData: null,
    },
  ]);

  // Modals state
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [modalProducts, setModalProducts] = useState<any[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [modalCustomers, setModalCustomers] = useState<any[]>([]);

  // Fetch Session & Warehouses
  useEffect(() => {
    // Try local storage for user role first
    try {
      const stored = localStorage.getItem('cf_user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch(e) {}

    fetch('/api/v1/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.user) setCurrentUser(d.data.user);
      })
      .catch(() => {});
      
    fetch('/api/v1/warehouses')
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setWarehouses(d.data);
          if (d.data.length > 0) setWarehouseId(d.data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const searchProducts = async (term: string) => {
    try {
      const res = await fetch(`/api/v1/products?search=${encodeURIComponent(term)}&per_page=50`);
      const d = await res.json();
      if (d.success) setModalProducts(d.data || []);
    } catch (err) {}
  };

  const searchCustomers = async (term: string) => {
    try {
      const res = await fetch(`/api/v1/customers?search=${encodeURIComponent(term)}&limit=50`);
      const d = await res.json();
      if (d.success) setModalCustomers(d.data || []);
    } catch (err) {}
  };

  const selectProduct = (product: any) => {
    if (activeLineIndex !== null) {
      const newLines = [...lines];
      const currentTier = newLines[activeLineIndex].priceTier || 'consumidor';
      let priceToApply = Number(product.price || 0);
      if (currentTier === 'proveedor') priceToApply = Number(product.priceProveedor || product.price || 0);
      else if (currentTier === 'mayorista') priceToApply = Number(product.priceMayorista || product.price || 0);

      newLines[activeLineIndex] = {
        ...newLines[activeLineIndex],
        productId: product.id,
        productName: product.name,
        unitPrice: priceToApply,
        taxRate: Number(product.taxRate ?? 0.18),
        productData: product,
      };
      setLines(newLines);
    }
    setProductSearchOpen(false);
  };

  const handlePriceTierChange = (idx: number, tier: 'consumidor' | 'proveedor' | 'mayorista') => {
    const updated = [...lines];
    updated[idx].priceTier = tier;
    
    if (updated[idx].productData) {
      const prod = updated[idx].productData;
      let priceToApply = Number(prod.price || 0);
      if (tier === 'proveedor') priceToApply = Number(prod.priceProveedor || prod.price || 0);
      else if (tier === 'mayorista') priceToApply = Number(prod.priceMayorista || prod.price || 0);
      
      updated[idx].unitPrice = priceToApply;
    }
    setLines(updated);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    const taxableByRate: Record<string, number> = {};

    lines.forEach(l => {
      const lSub = l.quantity * l.unitPrice;
      const lDisc = l.quantity * (Number(l.discount) || 0);
      const lTaxable = lSub - lDisc;
      
      subtotal += lSub;
      discount += lDisc;
      
      const rateStr = Number(l.taxRate || 0).toString();
      taxableByRate[rateStr] = (taxableByRate[rateStr] || 0) + lTaxable;
    });

    let tax = 0;
    Object.entries(taxableByRate).forEach(([rateStr, taxableAmt]) => {
      tax += taxableAmt * Number(rateStr);
    });

    return { subtotal, discount, tax, total: subtotal - discount + tax };
  };

  const totals = calculateTotals();
  const userRole = currentUser?.roleName?.toLowerCase() || currentUser?.role?.toLowerCase() || '';
  const canEditDiscount = ['admin', 'sistema', 'administrator', 'sistemas'].includes(userRole);

  const saveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some(l => !l.productId)) {
      return toast.error('Hay líneas sin producto seleccionado.');
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          warehouseId,
          notes,
          lines: lines.map(l => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            discount: Number(l.discount),
            taxRate: Number(l.taxRate),
            priceTier: l.priceTier,
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cotización creada exitosamente');
        router.push('/dashboard/quotes');
      } else {
        toast.error('Error al crear', { description: data.error?.message });
      }
    } catch (e: any) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      { productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.18, priceTier: 'consumidor', productData: null }
    ]);
  };

  return (
    <div className="pb-12 w-full">
      <motion.div
        key="form"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xl space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
          <div>
            <button onClick={() => router.push('/dashboard/quotes')} className="flex items-center gap-1.5 text-xs font-semibold text-[#C5A059] hover:text-[#b08c4a] mb-2 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Volver al listado
            </button>
            <h2 className="text-2xl font-bold text-[#003366] tracking-tight">Nueva Cotización</h2>
            <p className="text-on-surface-variant/80 text-sm mt-1">Complete los datos para generar una propuesta comercial.</p>
          </div>
        </div>

        <form onSubmit={saveQuote} className="space-y-8">
          {/* General Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/40 p-6 rounded-xl border border-slate-200">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Almacén Origen</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
                className="w-full rounded-lg bg-white border border-slate-300 py-2 px-3 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-xs transition-all"
              >
                <option value="">Seleccione Almacén...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Cliente (Receptor)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setCustomerSearchOpen(true); searchCustomers(''); }}
                  className="flex items-center gap-1.5 px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-[#003366] transition-all"
                >
                  <Search className="h-3.5 w-3.5" />
                  Buscar Cliente
                </button>
                <input
                  type="text"
                  readOnly
                  value={customerName || 'Consumidor Final (Opcional)'}
                  className="flex-1 rounded-lg bg-slate-50 border border-slate-300 py-2 px-3 text-[#003366]/70 cursor-not-allowed outline-none text-xs transition-all"
                />
                {customerId && (
                  <button
                    type="button"
                    onClick={() => { setCustomerId(''); setCustomerName(''); }}
                    className="p-3 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Item Lines */}
          <div className="space-y-4">
            <h4 className="text-[#003366] font-semibold text-base">Artículos / Servicios</h4>
            
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const lineSubtotal = line.quantity * line.unitPrice;
                const lineDiscount = line.quantity * (Number(line.discount) || 0);
                const lineTaxable = lineSubtotal - lineDiscount;
                const lineTax = lineTaxable * line.taxRate;
                const lineTotal = lineTaxable + lineTax;
                const hasProduct = !!line.productId;

                return (
                  <div key={idx} className="flex flex-col gap-4 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full items-end">
                      {/* Product search & show */}
                      <div className="md:col-span-5 space-y-1.5">
                        <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Producto o Servicio</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setActiveLineIndex(idx); setProductSearchOpen(true); searchProducts(''); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-[#003366] transition-all"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Buscar
                          </button>
                          <input
                            type="text"
                            readOnly
                            value={line.productName}
                            className="flex-1 rounded-lg bg-slate-50 border border-slate-300 py-2 px-3 text-[#003366]/70 cursor-not-allowed outline-none text-xs transition-all"
                            placeholder="Seleccione un producto..."
                            required
                          />
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Cant.</label>
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => {
                            const n = [...lines]; n[idx].quantity = parseFloat(e.target.value) || 0; setLines(n);
                          }}
                          disabled={!hasProduct}
                          className={`w-full rounded-lg border py-2 px-3 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                          min={1} step="any" required
                        />
                      </div>

                      {/* Price Tier */}
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Nivel</label>
                        <select
                          value={line.priceTier || 'consumidor'}
                          onChange={(e) => handlePriceTierChange(idx, e.target.value as any)}
                          disabled={!hasProduct}
                          className={`w-full rounded-lg border py-2 px-3 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                        >
                          <option value="consumidor">Consumidor</option>
                          <option value="mayorista">Mayorista</option>
                          <option value="proveedor">Proveedor</option>
                        </select>
                      </div>

                      {/* Unit Price */}
                      <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Precio U.</label>
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => {
                            const n = [...lines]; n[idx].unitPrice = parseFloat(e.target.value) || 0; setLines(n);
                          }}
                          disabled={!hasProduct}
                          className={`w-full rounded-lg border py-2 px-3 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                          min={0} step="any" required
                        />
                      </div>

                      {/* Discount */}
                      <div className="md:col-span-2 space-y-1.5 relative group">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
                          Desc. Unit.
                          {!canEditDiscount && hasProduct && (
                            <span className="text-[9px] text-red-500 normal-case bg-red-50 px-1.5 py-0.5 rounded font-semibold">Solo admin</span>
                          )}
                        </label>
                        <input
                          type="number"
                          disabled={!hasProduct || !canEditDiscount}
                          value={line.discount}
                          onChange={(e) => {
                            const n = [...lines]; n[idx].discount = parseFloat(e.target.value) || 0; setLines(n);
                          }}
                          className={`w-full rounded-lg border py-2 px-3 outline-none text-xs transition-all ${(!hasProduct || !canEditDiscount) ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                          min={0} step="any"
                        />
                      </div>

                      {/* Actions */}
                      <div className="md:col-span-1 flex justify-end pb-1.5">
                        <button
                          type="button"
                          onClick={() => { const n = [...lines]; n.splice(idx, 1); setLines(n); }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-start mt-2">
              <button
                type="button"
                onClick={handleAddLine}
                className="text-xs text-[#C5A059] font-bold hover:text-[#b08c4a] flex items-center gap-1.5 bg-[#C5A059]/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar Fila
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-slate-50/40 p-6 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Notas de la Cotización</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Condiciones especiales de la oferta, validez, tiempos de entrega..."
              rows={3}
              className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all resize-y placeholder:text-slate-400"
            />
          </div>

          {/* Calculation Summary & Submit */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-t border-slate-200 pt-8">
            <div className="bg-slate-50/60 p-5 rounded-xl border border-slate-200 w-full md:max-w-sm space-y-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold text-[#003366]">RD$ {totals.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span>Descuento:</span>
                <span className="font-semibold text-[#003366]">RD$ {totals.discount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant/80">
                <span>Impuestos (ITBIS):</span>
                <span className="font-semibold text-[#003366]">RD$ {totals.tax.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 mt-3 text-lg font-bold">
                <span className="text-[#003366]">Total General:</span>
                <span className="text-emerald-500">RD$ {totals.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-4 w-full md:w-auto">
              <button
                type="button"
                onClick={() => router.push('/dashboard/quotes')}
                className="rounded-xl border border-slate-300 bg-transparent px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-[#003366] transition-all text-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 rounded-xl bg-[#C5A059] px-8 py-3.5 text-sm font-bold text-slate-950 hover:bg-[#b08c4a] disabled:opacity-50 transition-all shadow-lg shadow-[#C5A059]/20 active:scale-[0.98]"
              >
                {submitting ? (
                  <><RefreshCw className="h-5 w-5 animate-spin" /> Procesando...</>
                ) : (
                  <><Check className="h-5 w-5" /> Guardar Cotización</>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>

      {/* Product Search Modal */}
      <AnimatePresence>
        {productSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
                <Search className="w-5 h-5 text-on-surface-variant/80" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar producto..." 
                  onChange={(e) => searchProducts(e.target.value)}
                  className="flex-1 bg-transparent text-[#003366] outline-none text-sm"
                />
                <button onClick={() => setProductSearchOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1 p-3 divide-y divide-slate-100">
                {modalProducts.map(p => (
                  <button 
                    type="button"
                    key={p.id}
                    onClick={() => selectProduct(p)}
                    className="w-full text-left py-3 hover:bg-slate-50 rounded-lg flex justify-between items-center px-3 group transition-colors"
                  >
                    <div>
                      <div className="text-[#003366] font-semibold text-sm group-hover:text-[#C5A059] transition-colors">{p.name}</div>
                      <div className="text-xs text-on-surface-variant/80 mt-0.5">SKU: {p.sku || '-'}</div>
                    </div>
                    <div className="text-[#003366] font-bold text-sm">
                      RD$ {Number(p.price || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </div>
                  </button>
                ))}
                {modalProducts.length === 0 && (
                  <div className="p-8 text-center text-on-surface-variant/70 text-sm">Escriba para buscar productos.</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Search Modal */}
      <AnimatePresence>
        {customerSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
                <Search className="w-5 h-5 text-on-surface-variant/80" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar cliente..." 
                  onChange={(e) => searchCustomers(e.target.value)}
                  className="flex-1 bg-transparent text-[#003366] outline-none text-sm"
                />
                <button onClick={() => setCustomerSearchOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1 p-3 divide-y divide-slate-100">
                {modalCustomers.map(c => (
                  <button 
                    type="button"
                    key={c.id}
                    onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearchOpen(false); }}
                    className="w-full text-left py-3 hover:bg-slate-50 rounded-lg flex justify-between items-center px-3 group transition-colors"
                  >
                    <div>
                      <div className="text-[#003366] font-semibold text-sm group-hover:text-[#C5A059] transition-colors">{c.name}</div>
                      <div className="text-xs text-on-surface-variant/80 mt-0.5">RNC/Cédula: {c.rncCedula || '-'}</div>
                    </div>
                  </button>
                ))}
                {modalCustomers.length === 0 && (
                  <div className="p-8 text-center text-on-surface-variant/70 text-sm">Escriba para buscar clientes.</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
