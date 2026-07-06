'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Trash2, ArrowLeft, Check, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ProductAutocomplete } from '@/components/ui/product-autocomplete';
import { CustomerAutocomplete } from '@/components/ui/customer-autocomplete';

export default function NewQuote() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  
  // App state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  
  // Form state
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerData, setSelectedCustomerData] = useState<any>(null);
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
      warehouseId: '',
    },
  ]);

  const [activePriceTierSelectIdx, setActivePriceTierSelectIdx] = useState<number | null>(null);

  // Fetch Session, Products, Categories, Customers & Warehouses
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cf_user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch(e) {}

    fetch('/api/v1/products?per_page=100')
      .then(r => r.json())
      .then(d => { 
        console.log('[Telemetry] Products loaded:', d.data?.length, d.success);
        if (d.success) setDbProducts(d.data || []); 
      })
      .catch((err) => console.error('[Telemetry] Fetch products error:', err));

    fetch('/api/v1/categories')
      .then(r => r.json())
      .then(d => { 
        console.log('[Telemetry] Categories loaded:', d.data?.length, d.success);
        if (d.success) setCategories(d.data || []); 
      })
      .catch((err) => console.error('[Telemetry] Fetch categories error:', err));

    fetch('/api/v1/customers?limit=100')
      .then(r => r.json())
      .then(d => { 
        console.log('[Telemetry] Customers loaded:', d.data?.length, d.success);
        if (d.success) setDbCustomers(d.data || []); 
      })
      .catch((err) => console.error('[Telemetry] Fetch customers error:', err));

    fetch('/api/v1/warehouses')
      .then(r => r.json())
      .then(d => {
        console.log('[Telemetry] Warehouses loaded:', d.data?.length);
        if (d.data) {
          setWarehouses(d.data);
          if (d.data.length > 0) setWarehouseId(d.data[0].id);
        }
      })
      .catch((err) => console.error('[Telemetry] Fetch warehouses error:', err));

    fetch('/api/v1/auth/me')
      .then(r => r.json())
      .then(d => { 
        console.log('[Telemetry] Auth loaded:', d.data?.user?.email, d.success);
        if (d.success && d.data?.user) setCurrentUser(d.data.user); 
      })
      .catch((err) => console.error('[Telemetry] Fetch auth error:', err));
  }, []);

  const applyCustomer = (customer: any) => {
    console.log('[Telemetry] Selected Customer:', customer);
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setSelectedCustomerData(customer);
  };

  const applyProductToLine = (idx: number, product: any) => {
    console.log('[Telemetry] Selected Product:', product, 'for line:', idx);
    setLines(prevLines => {
      const newLines = [...prevLines];
      if (!newLines[idx]) return prevLines;
      const tier = newLines[idx].priceTier || 'consumidor';
      let priceToApply = 0;
      if (tier === 'consumidor') {
        priceToApply = parseFloat(product.priceConsumidor) || parseFloat(product.price) || 0;
      } else if (tier === 'proveedor') {
        priceToApply = parseFloat(product.priceProveedor) || parseFloat(product.price) || 0;
      } else if (tier === 'mayorista') {
        priceToApply = parseFloat(product.priceMayorista) || parseFloat(product.price) || 0;
      }

      newLines[idx] = {
        ...newLines[idx],
        productId: product.id,
        productName: product.name,
        unitPrice: priceToApply,
        taxRate: Number(product.taxRate ?? 0.18),
        productData: product,
      };
      return newLines;
    });
  };

  const clearProductFromLine = (idx: number) => {
    setLines(prevLines => {
      const newLines = [...prevLines];
      if (!newLines[idx]) return prevLines;
      newLines[idx] = {
        productId: '',
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: 0.18,
        priceTier: 'consumidor',
        productData: null,
        warehouseId: '',
      };
      return newLines;
    });
  };

  const handleLineChange = (idx: number, field: string, val: any) => {
    setLines(prevLines => {
      const newLines = [...prevLines];
      if (!newLines[idx]) return prevLines;
      newLines[idx] = {
        ...newLines[idx],
        [field]: val,
      };
      return newLines;
    });
  };

  const handlePriceTierChange = (idx: number, tier: 'consumidor' | 'proveedor' | 'mayorista') => {
    const updated = [...lines];
    updated[idx].priceTier = tier;
    
    // Fetch productData dynamically from dbProducts first or line object
    const prod = updated[idx].productData || dbProducts.find(p => p.id === updated[idx].productId);
    if (prod) {
      let priceToApply = 0;
      if (tier === 'consumidor') {
        priceToApply = parseFloat(prod.priceConsumidor) || parseFloat(prod.price) || 0;
      } else if (tier === 'proveedor') {
        priceToApply = parseFloat(prod.priceProveedor) || parseFloat(prod.price) || 0;
      } else if (tier === 'mayorista') {
        priceToApply = parseFloat(prod.priceMayorista) || parseFloat(prod.price) || 0;
      }
      
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

  console.log('[Telemetry] Current Lines state in NewQuote render:', JSON.stringify(lines.map(l => ({ id: l.productId, name: l.productName, price: l.unitPrice }))));

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
      { productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.18, priceTier: 'consumidor', productData: null, warehouseId: '' }
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
          <div className="bg-slate-50/40 p-6 rounded-xl border border-slate-200 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Cliente (Receptor)</label>
              <CustomerAutocomplete
                dbCustomers={dbCustomers}
                customerId={customerId}
                customerName={customerName}
                onSelect={(c) => applyCustomer(c)}
                onTextChange={(val) => setCustomerName(val)}
                onClear={() => {
                  setCustomerId('');
                  setCustomerName('');
                  setSelectedCustomerData(null);
                }}
              />
            </div>

            {customerId && selectedCustomerData && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200/60">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#003366] uppercase tracking-wider block">RNC / Cédula</span>
                  <span className="text-xs font-semibold text-slate-700">{selectedCustomerData.rncCedula || selectedCustomerData.rnc || 'No especificado'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#003366] uppercase tracking-wider block">Teléfono</span>
                  <span className="text-xs font-semibold text-slate-700">{selectedCustomerData.phone || 'No especificado'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#003366] uppercase tracking-wider block">Correo Electrónico</span>
                  <span className="text-xs font-semibold text-slate-700">{selectedCustomerData.email || 'No especificado'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Item Lines */}
          <div className="space-y-4">
            <h4 className="text-[#003366] font-semibold text-base">Artículos / Servicios</h4>
            
            {/* Table Header for desktop */}
            <div className="hidden md:grid md:grid-cols-[3fr_0.8fr_1.2fr_1fr_1.1fr_1fr_1.4fr_0.5fr] gap-4 px-4 py-2 bg-slate-100/80 text-[#003366] text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-200">
              <div>Producto / Servicio</div>
              <div>Cant.</div>
              <div>Nivel de Precio</div>
              <div>Precio Unit.</div>
              <div>Desc. Unit.</div>
              <div>ITBIS</div>
              <div className="text-right">Total</div>
              <div className="text-center">Acción</div>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => {
                const lineSubtotal = line.quantity * line.unitPrice;
                const lineDiscount = line.quantity * (Number(line.discount) || 0);
                const lineTaxable = lineSubtotal - lineDiscount;
                const lineTax = lineTaxable * line.taxRate;
                const lineTotal = lineTaxable + lineTax;
                const hasProduct = !!line.productId;

                return (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-[3fr_0.8fr_1.2fr_1fr_1.1fr_1fr_1.4fr_0.5fr] gap-4 items-center bg-slate-50/60 p-4 md:py-2 md:px-4 rounded-xl border border-slate-200">
                    {/* Product Selection / Autocomplete */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Producto o Servicio</label>
                      <ProductAutocomplete
                        dbProducts={dbProducts}
                        categories={categories}
                        warehouses={warehouses}
                        valueName={line.productName}
                        hasProduct={hasProduct}
                        onSelect={(p) => applyProductToLine(idx, p)}
                        onTextChange={(val) => handleLineChange(idx, 'productName', val)}
                        selectedWarehouseId={line.warehouseId || warehouseId}
                        onWarehouseChange={(wId) => handleLineChange(idx, 'warehouseId', wId)}
                        onClear={() => clearProductFromLine(idx)}
                        allowOutOfStock={true}
                      />
                    </div>

                    {/* Quantity */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Cant.</label>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        disabled={!hasProduct}
                        className={`w-full rounded-lg border py-1.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                        min={0.0001} step="any" required
                      />
                    </div>

                    {/* Price Tier */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Nivel</label>
                      <select
                        value={line.priceTier || 'consumidor'}
                        onFocus={() => setActivePriceTierSelectIdx(idx)}
                        onBlur={() => setActivePriceTierSelectIdx(null)}
                        onChange={(e) => {
                          handlePriceTierChange(idx, e.target.value as any);
                          e.target.blur();
                        }}
                        disabled={!hasProduct}
                        className={`w-full rounded-lg border py-1.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                      >
                        <option value="consumidor">Consumidor</option>
                        <option value="mayorista">Mayorista</option>
                        <option value="proveedor">Proveedor</option>
                      </select>
                    </div>

                    {/* Unit Price */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Precio Unit.</label>
                      <input
                        type="number"
                        value={line.unitPrice}
                        onChange={(e) => handleLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        disabled={!hasProduct}
                        className={`w-full rounded-lg border py-1.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                        min={0} step="any" required
                      />
                    </div>

                    {/* Discount */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Desc. Unit.</label>
                      <input
                        type="number"
                        disabled={!hasProduct || !canEditDiscount}
                        value={line.discount}
                        onChange={(e) => handleLineChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                        className={`w-full rounded-lg border py-1.5 px-2 outline-none text-xs transition-all ${(!hasProduct || !canEditDiscount) ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                        min={0} step="any"
                      />
                    </div>

                    {/* Tax Rate (ITBIS) */}
                    <div className="space-y-1.5 md:space-y-0">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">ITBIS</label>
                      <select
                        value={line.taxRate}
                        onChange={(e) => handleLineChange(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                        disabled={!hasProduct}
                        className={`w-full rounded-lg border py-1.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                      >
                        <option value={0.18}>18% ITBIS</option>
                        <option value={0.16}>16% ITBIS</option>
                        <option value={0.08}>8% ITBIS</option>
                        <option value={0}>Exento (0%)</option>
                      </select>
                    </div>

                    {/* Line Total */}
                    <div className="space-y-1.5 md:space-y-0 text-right">
                      <label className="block md:hidden text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Total</label>
                      <span className="text-xs font-mono font-bold text-[#003366] pr-2">
                        RD$ {lineTotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="space-y-1.5 md:space-y-0 text-center">
                      <button
                        type="button"
                        onClick={() => { const n = [...lines]; n.splice(idx, 1); setLines(n); }}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors inline-flex items-center justify-center"
                        title="Eliminar línea"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
    </div>
  );
}
