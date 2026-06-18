'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Plus, Search, Save, X, Trash2, ArrowLeft,
  Building2, Package, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
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
        // Fetch session
        const sessionRes = await fetch('/api/v1/auth/session');
        const sessionData = await sessionRes.json();
        if (sessionData.success) setUserRole(sessionData.data.role);

        // Fetch warehouses
        const whRes = await fetch('/api/v1/inventory/warehouses');
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
              try {
                const pRes = await fetch(`/api/v1/products/${l.productId}`);
                const pData = await pRes.json();
                if (pData.success) productName = pData.data.name;
              } catch (e) {}
              
              // Find the tax rate for this line or use default
              return {
                productId: l.productId,
                productName,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                discount: Number(l.discount),
                taxRate: 0.18, // Simplified: ideally we calculate it from taxes
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
  const canEditDiscount = userRole === 'admin' || userRole === 'sistema';
  const isEditable = quoteStatus === 'pending';

  const saveQuote = async () => {
    if (!isEditable) return toast.error('Solo se pueden editar cotizaciones pendientes.');
    if (lines.some(l => !l.productId)) {
      return toast.error('Hay líneas sin producto seleccionado.');
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
      <DashboardLayout>
        <div className="flex items-center justify-center h-full bg-neutral-900">
          <div className="text-white">Cargando cotización...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-neutral-900 overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-white/10 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard/quotes')} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-white">Editar Cotización</h1>
            {!isEditable && (
              <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/20 rounded-md">
                Solo Lectura ({quoteStatus})
              </span>
            )}
          </div>
          {isEditable && (
            <button
              onClick={saveQuote}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {submitting ? 'Guardando...' : 'Guardar Cambios'}
              <Save className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-neutral-800/50 rounded-xl p-5 border border-white/5">
              <h2 className="text-lg font-medium text-white mb-4">Líneas de Productos</h2>
              
              <div className="space-y-4">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex flex-wrap items-start gap-3 p-4 bg-black/20 rounded-lg border border-white/5">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs text-neutral-400 mb-1 block">Producto</label>
                      <button 
                        disabled={!isEditable}
                        onClick={() => { setActiveLineIndex(idx); setProductSearchOpen(true); searchProducts(''); }}
                        className={clsx(
                          "w-full text-left px-3 py-2 border rounded-lg text-sm text-white",
                          isEditable ? "bg-neutral-900 border-white/10" : "bg-neutral-800 border-white/5 cursor-not-allowed opacity-70"
                        )}
                      >
                        {line.productName || 'Seleccionar Producto...'}
                      </button>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-neutral-400 mb-1 block">Cant.</label>
                      <input 
                        type="number" min="1" step="any"
                        disabled={!isEditable}
                        value={line.quantity}
                        onChange={(e) => {
                          const n = [...lines]; n[idx].quantity = Number(e.target.value); setLines(n);
                        }}
                        className={clsx(
                          "w-full px-3 py-2 border rounded-lg text-sm text-white",
                          isEditable ? "bg-neutral-900 border-white/10" : "bg-neutral-800 border-white/5 cursor-not-allowed"
                        )}
                      />
                    </div>
                    <div className="w-32">
                      <label className="text-xs text-neutral-400 mb-1 block">Precio</label>
                      <input 
                        type="number" step="any"
                        disabled={!isEditable}
                        value={line.unitPrice}
                        onChange={(e) => {
                          const n = [...lines]; n[idx].unitPrice = Number(e.target.value); setLines(n);
                        }}
                        className={clsx(
                          "w-full px-3 py-2 border rounded-lg text-sm text-white",
                          isEditable ? "bg-neutral-900 border-white/10" : "bg-neutral-800 border-white/5 cursor-not-allowed"
                        )}
                      />
                    </div>
                    <div className="w-28 relative group">
                      <label className="text-xs text-neutral-400 mb-1 block">Descuento</label>
                      <input 
                        type="number" step="any"
                        disabled={!isEditable || !canEditDiscount}
                        value={line.discount}
                        onChange={(e) => {
                          const n = [...lines]; n[idx].discount = Number(e.target.value); setLines(n);
                        }}
                        className={clsx(
                          "w-full px-3 py-2 border rounded-lg text-sm",
                          (!isEditable || !canEditDiscount)
                            ? "bg-neutral-800 border-white/5 text-neutral-500 cursor-not-allowed" 
                            : "bg-neutral-900 border-white/10 text-white"
                        )}
                      />
                      {!canEditDiscount && isEditable && (
                        <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black text-xs text-amber-400 rounded">
                          Solo administradores pueden modificar
                        </div>
                      )}
                    </div>
                    {isEditable && (
                      <div className="pt-6">
                        <button 
                          onClick={() => { const n = [...lines]; n.splice(idx, 1); setLines(n); }}
                          className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg"
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
                  className="mt-4 flex items-center gap-2 text-indigo-400 text-sm hover:underline"
                >
                  <Plus className="w-4 h-4" /> Agregar Línea
                </button>
              )}
            </div>

            <div className="bg-neutral-800/50 rounded-xl p-5 border border-white/5">
              <h2 className="text-lg font-medium text-white mb-4">Notas</h2>
              <textarea
                disabled={!isEditable}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={clsx(
                  "w-full px-3 py-2 border rounded-lg text-sm text-white",
                  isEditable ? "bg-neutral-900 border-white/10 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" : "bg-neutral-800 border-white/5 cursor-not-allowed"
                )}
                placeholder="Observaciones para el cliente..."
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Customer & Warehouse */}
            <div className="bg-neutral-800/50 rounded-xl p-5 border border-white/5">
              <h2 className="text-lg font-medium text-white mb-4">Detalles</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-neutral-400 mb-1.5 block">Cliente</label>
                  <div className="flex gap-2">
                    <button 
                      disabled={!isEditable}
                      onClick={() => { setCustomerSearchOpen(true); searchCustomers(''); }}
                      className={clsx(
                        "flex-1 text-left px-3 py-2 border rounded-lg text-sm text-white",
                        isEditable ? "bg-neutral-900 border-white/10" : "bg-neutral-800 border-white/5 cursor-not-allowed"
                      )}
                    >
                      {customerName || 'Consumidor Final (Opcional)'}
                    </button>
                    {customerId && isEditable && (
                      <button onClick={() => { setCustomerId(''); setCustomerName(''); }} className="p-2 text-neutral-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-neutral-400 mb-1.5 block">Almacén</label>
                  <select
                    disabled={!isEditable}
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className={clsx(
                      "w-full px-3 py-2 border rounded-lg text-sm text-white",
                      isEditable ? "bg-neutral-900 border-white/10" : "bg-neutral-800 border-white/5 cursor-not-allowed"
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
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-xl p-5 border border-indigo-500/20">
              <h2 className="text-lg font-medium text-white mb-4">Resumen</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span>Subtotal</span>
                  <span>${totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Descuento</span>
                  <span>${totals.discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Impuestos (ITBIS)</span>
                  <span>${totals.tax.toFixed(2)}</span>
                </div>
                <div className="pt-3 mt-3 border-t border-white/10 flex justify-between font-bold text-lg text-white">
                  <span>Total</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Search Modal */}
      <AnimatePresence>
        {productSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <Search className="w-5 h-5 text-neutral-400" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar producto..." 
                  onChange={(e) => searchProducts(e.target.value)}
                  className="flex-1 bg-transparent text-white outline-none"
                />
                <button onClick={() => setProductSearchOpen(false)} className="text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1 p-2">
                {modalProducts.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => selectProduct(p)}
                    className="w-full text-left p-3 hover:bg-white/5 rounded-lg flex justify-between items-center group"
                  >
                    <div>
                      <div className="text-white font-medium group-hover:text-indigo-400 transition-colors">{p.name}</div>
                      <div className="text-xs text-neutral-500">{p.sku}</div>
                    </div>
                    <div className="text-emerald-400 font-medium">
                      ${Number(p.price).toFixed(2)}
                    </div>
                  </button>
                ))}
                {modalProducts.length === 0 && (
                  <div className="p-8 text-center text-neutral-500">Busca para encontrar productos.</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Search Modal */}
      <AnimatePresence>
        {customerSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <Search className="w-5 h-5 text-neutral-400" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Buscar cliente..." 
                  onChange={(e) => searchCustomers(e.target.value)}
                  className="flex-1 bg-transparent text-white outline-none"
                />
                <button onClick={() => setCustomerSearchOpen(false)} className="text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1 p-2">
                {modalCustomers.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearchOpen(false); }}
                    className="w-full text-left p-3 hover:bg-white/5 rounded-lg flex justify-between items-center group"
                  >
                    <div>
                      <div className="text-white font-medium group-hover:text-indigo-400 transition-colors">{c.name}</div>
                      <div className="text-xs text-neutral-500">{c.rncCedula}</div>
                    </div>
                  </button>
                ))}
                {modalCustomers.length === 0 && (
                  <div className="p-8 text-center text-neutral-500">Busca para encontrar clientes.</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardLayout>
  );
}
