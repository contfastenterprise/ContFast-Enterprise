'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Search, Plus, Save, Trash2, Box, Store, Banknote, Calendar, Tag, FileText, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Product { id: string; name: string; sku: string; cost: string; }
interface Supplier { id: string; name: string; rnc: string; }
interface Warehouse { id: string; name: string; }

export default function PurchasesPage() {
  const [loading, setLoading] = useState(false);
  const [isMinorExpense, setIsMinorExpense] = useState(false);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [ncf, setNcf] = useState('');
  const [expenseType, setExpenseType] = useState('02'); // Gastos por Trabajos, Suministros y Servicios (o 09 Compras)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('01'); // Efectivo
  const [warehouseId, setWarehouseId] = useState('');
  const [description, setDescription] = useState('');

  // Lines
  const [lines, setLines] = useState<{ id: string; productId: string; desc: string; quantity: number; unitCost: number; subtotal: number; itbis: number; total: number; }[]>([]);

  // Lookup data
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/products?limit=1000').then(r => r.json()),
      fetch('/api/v1/suppliers').then(r => r.json()),
      fetch('/api/v1/warehouses').then(r => r.json())
    ]).then(([pr, sp, wh]) => {
      if (pr.success) setProducts(pr.data.items || pr.data || []);
      if (sp.success) setSuppliers(sp.data || []);
      if (wh.success) {
        setWarehouses(wh.data);
        if (wh.data.length > 0) setWarehouseId(wh.data[0].id);
      }
    });
  }, []);

  const addLine = () => {
    setLines([...lines, { id: Math.random().toString(), productId: '', desc: '', quantity: 1, unitCost: 0, subtotal: 0, itbis: 0, total: 0 }]);
  };

  const updateLine = (id: string, field: string, value: any) => {
    setLines(lines.map(l => {
      if (l.id === id) {
        const newLine = { ...l, [field]: value };
        
        if (field === 'productId' && value) {
          const prod = products.find(p => p.id === value);
          if (prod) {
            newLine.desc = prod.name;
            newLine.unitCost = parseFloat(prod.cost) || 0;
          }
        }

        // Recalc only total if subtotal/itbis changed manually, or calculate 18% if it's a new product selection
        if (field === 'productId' || field === 'quantity' || field === 'unitCost') {
          newLine.subtotal = newLine.quantity * newLine.unitCost;
          // Only auto-calc 18% if we just picked a product. Otherwise leave the manual ITBIS.
          if (field === 'productId') {
            newLine.itbis = newLine.subtotal * 0.18;
          }
        }
        newLine.total = newLine.subtotal + newLine.itbis;
        return newLine;
      }
      return l;
    }));
  };

  const [globalIsc, setGlobalIsc] = useState(0);
  const [globalOtherTaxes, setGlobalOtherTaxes] = useState(0);

  const removeLine = (id: string) => setLines(lines.filter(l => l.id !== id));

  const totalSubtotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
  const totalItbis = lines.reduce((acc, l) => acc + l.itbis, 0);
  const grandTotal = totalSubtotal + totalItbis + globalIsc + globalOtherTaxes;

  const saveExpense = async () => {
    if (!isMinorExpense && !supplierId) return toast.error('Selecciona un suplidor');
    if (!issueDate) return toast.error('Selecciona fecha de factura');
    if (lines.length === 0) return toast.error('Agrega al menos una línea');

    setLoading(true);
    try {
      const payload = {
        supplierId: isMinorExpense ? null : supplierId,
        isMinorExpense,
        expenseType,
        ncf,
        issueDate,
        paymentMethod,
        warehouseId,
        description,
        amount: totalSubtotal,
        itbis: totalItbis,
        isc: globalIsc,
        otherTaxes: globalOtherTaxes,
        lines: lines.map(l => ({
          productId: l.productId || null,
          description: l.desc,
          quantity: l.quantity,
          unitCost: l.unitCost,
          subtotal: l.subtotal,
          itbis: l.itbis,
          total: l.total
        }))
      };

      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Compra / Gasto guardado exitosamente');
        // Reset
        setLines([]);
        setNcf('');
        setDescription('');
        setGlobalIsc(0);
        setGlobalOtherTaxes(0);
      } else {
        toast.error('Error guardando gasto', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold flex items-center gap-3">
            <Banknote className="h-8 w-8 text-primary" /> Compras y Gastos
          </h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">Registra comprobantes de suplidores o gastos menores.</p>
        </div>
        <button
          onClick={saveExpense}
          disabled={loading}
          className="bg-primary text-on-primary px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          <span className="font-label-md text-sm font-bold">Guardar Transacción</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cabecera del Gasto */}
        <section className="lg:col-span-2 space-y-6">
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
            <h3 className="font-bold text-primary mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Datos del Comprobante
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div 
                className="col-span-1 md:col-span-2 flex items-center gap-3 p-4 bg-surface-container-low rounded-2xl cursor-pointer hover:bg-surface-container transition-all"
                onClick={() => setIsMinorExpense(!isMinorExpense)}
              >
                {isMinorExpense ? <CheckSquare className="h-6 w-6 text-primary" /> : <Square className="h-6 w-6 text-on-surface-variant/40" />}
                <div>
                  <p className="font-bold text-primary">Es un Gasto Menor (Caja Chica)</p>
                  <p className="text-xs text-on-surface-variant">No requiere suplidor formal. Útil para compras informales o servicios rápidos.</p>
                </div>
              </div>

              {!isMinorExpense && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Suplidor (Proveedor)</label>
                  <select 
                    value={supplierId} onChange={e => setSupplierId(e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Selecciona un suplidor...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.rnc}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">NCF (Opcional si es Gasto Menor)</label>
                <input 
                  type="text" placeholder={isMinorExpense ? "Ej. B13..." : "Ej. B01..."}
                  value={ncf} onChange={e => setNcf(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Fecha Emisión</label>
                <input 
                  type="date"
                  value={issueDate} onChange={e => setIssueDate(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Tipo de Gasto (Formato 606)</label>
                <select 
                  value={expenseType} onChange={e => setExpenseType(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="01">01 - Gastos de Personal</option>
                  <option value="02">02 - Trabajos, Suministros y Servicios</option>
                  <option value="09">09 - Compras de Mercancía (Inventario)</option>
                  <option value="11">11 - Gastos Financieros</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Concepto General</label>
              <textarea 
                rows={2} placeholder="Descripción de la compra..."
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-primary uppercase tracking-wider text-sm flex items-center gap-2">
                <Box className="h-4 w-4" /> Líneas de Compra / Gasto
              </h3>
              <button 
                onClick={addLine}
                className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/20 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Añadir Línea
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/20">
                    <th className="px-4 py-3 font-label-md text-[10px] font-bold text-on-surface-variant">PRODUCTO / SERVICIO</th>
                    <th className="px-4 py-3 font-label-md text-[10px] font-bold text-on-surface-variant w-24">CANTIDAD</th>
                    <th className="px-4 py-3 font-label-md text-[10px] font-bold text-on-surface-variant w-28">COSTO UND.</th>
                    <th className="px-4 py-3 font-label-md text-[10px] font-bold text-on-surface-variant w-28">ITBIS</th>
                    <th className="px-4 py-3 font-label-md text-[10px] font-bold text-on-surface-variant w-28 text-right">TOTAL</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-outline-variant/10">
                      <td className="px-4 py-2">
                        <select 
                          value={l.productId} onChange={e => updateLine(l.id, 'productId', e.target.value)}
                          className="w-full bg-surface-container-high border-none rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary mb-1"
                        >
                          <option value="">Servicio o Gasto Manual...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input 
                          type="text" placeholder="Descripción..." value={l.desc}
                          onChange={e => updateLine(l.id, 'desc', e.target.value)}
                          className="w-full bg-white border border-outline-variant/20 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" min="1" value={l.quantity}
                          onChange={e => updateLine(l.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full bg-surface-container-high border-none rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="0.01" value={l.unitCost}
                          onChange={e => updateLine(l.id, 'unitCost', parseFloat(e.target.value) || 0)}
                          className="w-full bg-surface-container-high border-none rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="0.01" value={l.itbis}
                          onChange={e => updateLine(l.id, 'itbis', parseFloat(e.target.value) || 0)}
                          className="w-full bg-surface-container-high border-none rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-mono-data font-bold text-sm text-primary">RD${l.total.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => removeLine(l.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm font-medium text-on-surface-variant/60">
                        Aún no has agregado productos o servicios a esta compra.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Resumen y Config */}
        <section className="space-y-6">
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
            <h3 className="font-bold text-primary mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
              <Store className="h-4 w-4" /> Configuración
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Almacén Destino (Inventario)</label>
                <select 
                  value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">No afecta inventario</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <p className="text-[10px] text-on-surface-variant mt-1 ml-1">Los productos con registro sumarán stock a este almacén.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Método de Pago</label>
                <select 
                  value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="01">Efectivo</option>
                  <option value="02">Cheque</option>
                  <option value="03">Transferencia</option>
                  <option value="04">A Crédito (CXP)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-primary text-on-primary rounded-3xl p-6 shadow-xl shadow-primary/20">
            <h3 className="font-bold uppercase tracking-wider text-sm mb-6 flex items-center gap-2">
              <Tag className="h-4 w-4" /> Resumen Total
            </h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-on-primary/80">Subtotal</span>
                <span className="font-mono-data font-bold">RD$ {totalSubtotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-on-primary/80">ITBIS (Editable por línea)</span>
                <span className="font-mono-data font-bold">RD$ {totalItbis.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-on-primary/80 flex items-center gap-2">ISC <span className="text-[10px] opacity-70">(Combustibles)</span></span>
                <input 
                  type="number" step="0.01" value={globalIsc || ''} onChange={e => setGlobalIsc(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-white/10 border-none rounded-lg px-2 py-1 text-right text-sm font-mono-data font-bold focus:ring-1 focus:ring-white outline-none"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-on-primary/80">Otros Impuestos</span>
                <input 
                  type="number" step="0.01" value={globalOtherTaxes || ''} onChange={e => setGlobalOtherTaxes(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-white/10 border-none rounded-lg px-2 py-1 text-right text-sm font-mono-data font-bold focus:ring-1 focus:ring-white outline-none"
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/20 flex justify-between items-center">
              <span className="text-sm font-bold">TOTAL NETO</span>
              <span className="font-display-lg text-2xl font-black">RD$ {grandTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
