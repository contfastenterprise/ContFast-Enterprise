'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Save, X, Trash2, ArrowLeft,
  Building2, Package, Check, Printer, ChevronDown, RefreshCw, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  
  // App state
  const [userRole, setUserRole] = useState<string>('');
  
  // Form state
  const [quoteStatus, setQuoteStatus] = useState('pending');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<any[]>([]);

  // Modals state
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [modalProducts, setModalProducts] = useState<any[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [modalCustomers, setModalCustomers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch user role
        const sessionRes = await fetch('/api/v1/auth/me');
        const sessionData = await sessionRes.json();
        if (sessionData.success && sessionData.data?.user) {
          setUserRole(sessionData.data.user.role);
        }

        // Fetch warehouses
        const whRes = await fetch('/api/v1/warehouses');
        const whData = await whRes.json();
        if (whData.success) setWarehouses(whData.data);

        // Fetch quote data
        const quoteRes = await fetch(`/api/v1/quotes/${id}`);
        const quoteData = await quoteRes.json();
        
        if (quoteData.success) {
          const q = quoteData.data;
          setQuoteStatus(q.status);
          setCustomerId(q.customerId || '');
          setWarehouseId(q.warehouseId || (whData.data.length > 0 ? whData.data[0].id : ''));
          setNotes(q.notes || '');
          
          if (q.customerId) {
            // we could fetch customer details to get the name, but for now just show ID or fetch it
            const cRes = await fetch(`/api/v1/customers/${q.customerId}`);
            const cData = await cRes.json();
            if (cData.success) setCustomerName(cData.data.name);
          }
          
          if (q.lines && q.lines.length > 0) {
            // Need to fetch product names since quoteLines only has productId
            const linesWithDetails = await Promise.all(q.lines.map(async (l: any) => {
              let productName = 'Producto Desconocido';
              let productCost = 0;
              try {
                const pRes = await fetch(`/api/v1/products/${l.productId}`);
                const pData = await pRes.json();
                if (pData.success) {
                  productName = pData.data.name;
                  productCost = Number(pData.data.cost) || 0;
                }
              } catch (e) {}
              
              // Find the tax rate for this line or use default
              return {
                productId: l.productId,
                productName,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                discount: Number(l.discount),
                taxRate: 0.18, // Simplified: ideally we calculate it from taxes
                productCost,
              };
            }));
            setLines(linesWithDetails);
          } else {
            setLines([]);
          }
        } else {
          toast.error('Error cargando cotización', { description: quoteData.error?.message });
        }
      } catch (error) {
        toast.error('Error de red');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id]);

  const searchProducts = async (term: string) => {
    const res = await fetch(`/api/v1/products?search=${term}`);
    const d = await res.json();
    if (d.success) setModalProducts(d.data);
  };

  const searchCustomers = async (term: string) => {
    const res = await fetch(`/api/v1/customers?search=${term}`);
    const d = await res.json();
    if (d.success) setModalCustomers(d.data);
  };

  const selectProduct = (product: any) => {
    if (activeLineIndex !== null) {
      const newLines = [...lines];
      newLines[activeLineIndex] = {
        ...newLines[activeLineIndex],
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        taxRate: Number(product.taxRate || 0.18),
        productCost: Number(product.cost || 0),
      };
      setLines(newLines);
    }
    setProductSearchOpen(false);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    lines.forEach(l => {
      const lSub = l.quantity * l.unitPrice;
      const lDisc = Number(l.discount) || 0;
      const lTax = (lSub - lDisc) * l.taxRate;
      subtotal += lSub;
      discount += lDisc;
      tax += lTax;
    });
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  };

  const totals = calculateTotals();
  const canEditDiscount = ['admin', 'sistema', 'administrator', 'sistemas'].includes(userRole.toLowerCase());
  const isEditable = quoteStatus === 'pending';

  const saveQuote = async (shouldPrint = false) => {
    setSaveDropdownOpen(false);
    if (!isEditable) return toast.error('Solo se pueden editar cotizaciones pendientes.');
    if (lines.some(l => !l.productId)) {
      return toast.error('Hay líneas sin producto seleccionado.');
    }
    
    // Check unit price against cost
    for (const line of lines) {
      if (line.productId) {
        const cost = line.productCost || 0;
        if (cost > 0 && Number(line.unitPrice) < cost) {
          toast.error(`El precio ingresado no es permitido para "${line.productName}" (Mínimo: RD$ ${cost.toLocaleString('es-DO', { minimumFractionDigits: 2 })}).`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          warehouseId,
          notes,
          lines: lines.map(l => ({
            ...l,
            discount: Number(l.discount)
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cotización actualizada exitosamente');
        if (shouldPrint) {
          window.open(`/api/v1/quotes/${id}/print`, '_blank');
        }
        router.push('/dashboard/quotes');
      } else {
        toast.error('Error al actualizar', { description: data.error?.message });
      }
    } catch (e: any) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="pb-12 w-full flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
          <p className="text-sm font-medium">Cargando cotización...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12 w-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-2">
          <div className="flex items-start gap-4">
            <button onClick={() => router.push('/dashboard/quotes')} className="p-2 mt-1 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <nav className="flex items-center gap-2 text-slate-600 font-medium text-xs mb-2">
                <span>Facturación</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-[#C5A059] font-bold">Cotizaciones</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-[#003366] font-bold">Ver / Editar</span>
              </nav>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl md:text-4xl font-bold text-[#003366] tracking-tight">{isEditable ? 'Editar Cotización' : 'Ver Cotización'}</h1>
                {!isEditable && (
                  <span className="px-2 py-1 text-[10px] bg-red-50 text-red-600 border border-red-200 rounded-md font-bold uppercase tracking-wider">
                    Solo Lectura ({quoteStatus})
                  </span>
                )}
              </div>
            </div>
          </div>
          {isEditable && (
            <div className="relative flex">
              <button
                type="button"
                onClick={() => saveQuote(false)}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-l-xl bg-[#003366] px-6 py-3 text-sm font-bold text-white hover:bg-[#002244] disabled:opacity-50 transition shadow-lg active:scale-[0.98] border-r border-[#002244]"
              >
                {submitting ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                ) : (
                  <><Check className="h-4 w-4" /> Guardar Cambios</>
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => { e.stopPropagation(); setSaveDropdownOpen(v => !v); }}
                className="flex items-center justify-center rounded-r-xl bg-[#003366] px-3 py-3 text-white hover:bg-[#002244] disabled:opacity-50 transition shadow-lg active:scale-[0.98]"
                title="Más opciones"
              >
                <ChevronDown className="h-4 w-4" />
              </button>

              <AnimatePresence>
                {saveDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setSaveDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full right-0 mt-2 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[240px]"
                    >
                      <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opciones de Guardado</p>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => saveQuote(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-amber-50 transition-colors text-left"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <Printer className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#003366] text-xs">Guardar e Imprimir</p>
                          <p className="text-[11px] text-slate-500">Guarda cambios y abre el PDF</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => saveQuote(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Check className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#003366] text-xs">Solo Guardar</p>
                          <p className="text-[11px] text-slate-500">Guarda y regresa al listado</p>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-lg">
              <h2 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#C5A059]" />
                Líneas de Productos
              </h2>
              
              <div className="space-y-4">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex flex-wrap items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Producto</label>
                      <button 
                        disabled={!isEditable}
                        onClick={() => { setActiveLineIndex(idx); setProductSearchOpen(true); searchProducts(''); }}
                        className={clsx(
                          "w-full text-left px-3 py-2.5 border rounded-lg text-xs font-semibold",
                          isEditable ? "bg-white border-slate-300 text-[#003366] hover:border-[#C5A059] transition-colors" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                        )}
                      >
                        {line.productName || 'Seleccionar Producto...'}
                      </button>
                    </div>
                    <div className="w-24">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Cant.</label>
                      <input 
                        type="number" min="1" step="any"
                        disabled={!isEditable}
                        value={line.quantity}
                        onChange={(e) => {
                          const n = [...lines]; n[idx].quantity = Number(e.target.value); setLines(n);
                        }}
                        className={clsx(
                          "w-full px-3 py-2.5 border rounded-lg text-xs font-semibold outline-none",
                          isEditable ? "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/20 transition" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                        )}
                      />
                    </div>
                    <div className="w-32 relative group">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Precio (RD$)</label>
                      {(() => {
                        const pCost = line.productCost || 0;
                        const isBelowCost = pCost > 0 && line.unitPrice < pCost;
                        return (
                          <div className="relative">
                            <input 
                              type="number" step="any"
                              disabled={!isEditable}
                              value={line.unitPrice}
                              onChange={(e) => {
                                const n = [...lines]; n[idx].unitPrice = Number(e.target.value); setLines(n);
                              }}
                              className={clsx(
                                "w-full px-3 py-2.5 border rounded-lg text-xs font-semibold outline-none",
                                !isEditable ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed" :
                                isBelowCost ? "bg-red-50 border-red-500 text-red-700 focus:border-red-600 focus:ring-1 focus:ring-red-500" :
                                "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/20 transition"
                              )}
                            />
                            {isBelowCost && (
                              <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-10 w-48 p-2 bg-red-100 border border-red-200 text-red-800 text-[10px] rounded shadow-lg">
                                El precio ingresado no es permitido (Mínimo: RD$ {pCost.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="w-28 relative group">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Desc. (RD$)
                        {!canEditDiscount && isEditable && (
                          <span className="text-[8px] text-amber-700 bg-amber-100 px-1 py-0.5 rounded uppercase font-bold whitespace-nowrap">Solo admin</span>
                        )}
                      </label>
                      <input 
                        type="number" step="any"
                        disabled={!isEditable || !canEditDiscount}
                        value={line.discount}
                        onChange={(e) => {
                          const n = [...lines]; n[idx].discount = Number(e.target.value); setLines(n);
                        }}
                        className={clsx(
                          "w-full px-3 py-2.5 border rounded-lg text-xs font-semibold outline-none",
                          (!isEditable || !canEditDiscount)
                            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" 
                            : "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/20 transition"
                        )}
                      />
                    </div>
                    {isEditable && (
                      <div className="pt-[22px]">
                        <button 
                          onClick={() => { const n = [...lines]; n.splice(idx, 1); setLines(n); }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                          title="Eliminar Línea"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isEditable && (
                <button 
                  onClick={() => setLines([...lines, { productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.18 }])}
                  className="mt-4 flex items-center gap-2 text-[#C5A059] text-xs font-bold hover:text-[#b08c4a] transition-colors bg-[#C5A059]/10 px-4 py-2 rounded-lg"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} /> Agregar Producto
                </button>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-lg">
              <h2 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#C5A059]" />
                Notas y Observaciones
              </h2>
              <textarea
                disabled={!isEditable}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={clsx(
                  "w-full px-3 py-2.5 border rounded-lg text-xs font-medium outline-none transition",
                  isEditable ? "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/20" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                )}
                placeholder="Condiciones de pago, validez de la oferta, etc..."
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Customer & Warehouse */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-lg">
              <h2 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#C5A059]" />
                Detalles Generales
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Cliente</label>
                  <div className="flex gap-2">
                    <button 
                      disabled={!isEditable}
                      onClick={() => { setCustomerSearchOpen(true); searchCustomers(''); }}
                      className={clsx(
                        "flex-1 text-left px-3 py-2.5 border rounded-lg text-xs font-semibold transition-colors",
                        isEditable ? "bg-white border-slate-300 text-[#003366] hover:border-[#C5A059]" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                      )}
                    >
                      {customerName || 'Consumidor Final (Opcional)'}
                    </button>
                    {customerId && isEditable && (
                      <button onClick={() => { setCustomerId(''); setCustomerName(''); }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Almacén de Origen</label>
                  <select
                    disabled={!isEditable}
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className={clsx(
                      "w-full px-3 py-2.5 border rounded-lg text-xs font-semibold outline-none appearance-none transition-colors",
                      isEditable ? "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/20" : "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                    )}
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="bg-[#003366] rounded-xl p-6 shadow-xl relative overflow-hidden border border-[#002244]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A059]/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                Resumen Financiero
              </h2>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Subtotal</span>
                  <span>RD$ {totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-300/80 font-medium">
                  <span>Descuento Aplicado</span>
                  <span>- RD$ {totals.discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Impuestos (ITBIS)</span>
                  <span>RD$ {totals.tax.toFixed(2)}</span>
                </div>
                <div className="pt-4 mt-4 border-t border-white/10 flex justify-between items-end">
                  <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">Total a Pagar</span>
                  <span className="font-bold text-2xl text-[#C5A059]">RD$ {totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Product Search Modal */}
      <AnimatePresence>
        {productSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                <Search className="w-5 h-5 text-slate-400" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar por nombre o código..." 
                  onChange={(e) => searchProducts(e.target.value)}
                  className="flex-1 bg-transparent text-[#003366] text-sm font-semibold outline-none placeholder:text-slate-400 placeholder:font-normal"
                />
                <button onClick={() => setProductSearchOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm"><X className="w-4 h-4" /></button>
              </div>
              <div className="overflow-auto flex-1 p-2">
                {modalProducts.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => selectProduct(p)}
                    className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex justify-between items-center group transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div>
                      <div className="text-[#003366] font-bold text-sm group-hover:text-[#C5A059] transition-colors">{p.name}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">SKU: {p.sku}</div>
                    </div>
                    <div className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-md text-xs border border-emerald-100">
                      RD$ {Number(p.price).toFixed(2)}
                    </div>
                  </button>
                ))}
                {modalProducts.length === 0 && (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <Search className="w-10 h-10 text-slate-200 mb-3" />
                    <p className="text-slate-500 text-sm font-medium">Busca para encontrar productos.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Search Modal */}
      <AnimatePresence>
        {customerSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                <Search className="w-5 h-5 text-slate-400" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar por nombre o RNC..." 
                  onChange={(e) => searchCustomers(e.target.value)}
                  className="flex-1 bg-transparent text-[#003366] text-sm font-semibold outline-none placeholder:text-slate-400 placeholder:font-normal"
                />
                <button onClick={() => setCustomerSearchOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm"><X className="w-4 h-4" /></button>
              </div>
              <div className="overflow-auto flex-1 p-2">
                {modalCustomers.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearchOpen(false); }}
                    className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex justify-between items-center group transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div>
                      <div className="text-[#003366] font-bold text-sm group-hover:text-[#C5A059] transition-colors">{c.name}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">RNC/Cédula: {c.rncCedula}</div>
                    </div>
                  </button>
                ))}
                {modalCustomers.length === 0 && (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <Building2 className="w-10 h-10 text-slate-200 mb-3" />
                    <p className="text-slate-500 text-sm font-medium">Busca para encontrar clientes.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
