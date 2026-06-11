'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Search, Plus, Trash2, Building2, Package, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Warehouse {
  id: string;
  name: string;
  code: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  unitOfMeasure: string;
}

interface TransferItem {
  product: Product;
  quantity: number;
}

export default function TransferPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceWarehouse, setSourceWarehouse] = useState('');
  const [destinationWarehouse, setDestinationWarehouse] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Selector state
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [whRes, prRes] = await Promise.all([
        fetch('/api/v1/warehouses'),
        fetch('/api/v1/products?per_page=1000') // fetch all for simplicity, ideally autocomplete
      ]);
      const whData = await whRes.json();
      const prData = await prRes.json();
      
      if (whData.data) setWarehouses(whData.data);
      if (prData.data) setProducts(prData.data);
    } catch (error) {
      toast.error('Error al cargar datos iniciales');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    if (!selectedProduct) return toast.error('Seleccione un producto');
    if (!selectedQuantity || Number(selectedQuantity) <= 0) return toast.error('Ingrese una cantidad válida');

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    if (items.some(i => i.product.id === product.id)) {
      return toast.error('El producto ya está en la lista');
    }

    setItems([...items, { product, quantity: Number(selectedQuantity) }]);
    setSelectedProduct('');
    setSelectedQuantity('');
  };

  const removeItem = (productId: string) => {
    setItems(items.filter(i => i.product.id !== productId));
  };

  const handleTransfer = async () => {
    if (!sourceWarehouse) return toast.error('Seleccione el almacén de origen');
    if (!destinationWarehouse) return toast.error('Seleccione el almacén de destino');
    if (sourceWarehouse === destinationWarehouse) return toast.error('El origen y destino no pueden ser iguales');
    if (items.length === 0) return toast.error('Agregue al menos un producto');

    setSubmitting(true);
    try {
      const payload = {
        sourceWarehouseId: sourceWarehouse,
        destinationWarehouseId: destinationWarehouse,
        reason,
        items: items.map(i => ({ productId: i.product.id, quantity: i.quantity }))
      };

      const res = await fetch('/api/v1/inventory/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar el traslado');

      toast.success('Traslado completado exitosamente');
      // Reset form
      setSourceWarehouse('');
      setDestinationWarehouse('');
      setItems([]);
      setReason('');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-surface-bright p-6 rounded-3xl border border-outline-variant/30 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shadow-inner">
          <ArrowRightLeft className="w-7 h-7" />
        </div>
        <div>
          <h1 className="font-display-sm text-2xl font-bold text-on-surface">Traslados de Mercancía</h1>
          <p className="font-body-md text-on-surface-variant">
            Mueve inventario entre tus diferentes almacenes.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Form & Selection */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
              <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Ruta del Traslado
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-on-surface mb-1.5">Almacén Origen</label>
                  <select
                    value={sourceWarehouse}
                    onChange={(e) => setSourceWarehouse(e.target.value)}
                    className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary outline-none"
                  >
                    <option value="">Seleccione Origen...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
                <div className="flex justify-center text-on-surface-variant/50">
                  <ArrowRightLeft className="w-6 h-6 rotate-90" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-on-surface mb-1.5">Almacén Destino</label>
                  <select
                    value={destinationWarehouse}
                    onChange={(e) => setDestinationWarehouse(e.target.value)}
                    className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary outline-none"
                  >
                    <option value="">Seleccione Destino...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
              <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Agregar Producto
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-on-surface mb-1.5">Producto</label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary outline-none"
                  >
                    <option value="">Buscar producto...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.sku ? `[${p.sku}] ` : ''}{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-on-surface mb-1.5">Cantidad</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={selectedQuantity}
                    onChange={(e) => setSelectedQuantity(e.target.value)}
                    className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary outline-none"
                    placeholder="0.00"
                  />
                </div>
                <button
                  onClick={addItem}
                  className="w-full bg-surface-variant text-on-surface hover:bg-primary/10 hover:text-primary font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Agregar a Lista
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: List and Submit */}
          <div className="lg:col-span-2 space-y-6 flex flex-col h-full">
            <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex-1 flex flex-col">
              <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-4">
                Artículos a Trasladar
              </h3>
              
              <div className="flex-1 bg-surface-variant/20 border border-outline-variant/30 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant/30">
                    <tr>
                      <th className="p-4 font-bold text-sm text-on-surface-variant">Producto</th>
                      <th className="p-4 font-bold text-sm text-on-surface-variant text-right">Cantidad</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-12 text-center text-on-surface-variant/60">
                          No se han agregado productos al traslado.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-variant/30">
                          <td className="p-4 text-sm font-bold text-on-surface">
                            {item.product.name}
                            <span className="block text-xs font-normal text-on-surface-variant mt-0.5">{item.product.sku || 'Sin SKU'}</span>
                          </td>
                          <td className="p-4 text-sm font-bold text-primary text-right">
                            {item.quantity} <span className="text-xs font-normal text-on-surface-variant">{item.product.unitOfMeasure}</span>
                          </td>
                          <td className="p-4 text-right">
                            <button onClick={() => removeItem(item.product.id)} className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-bold text-on-surface mb-1.5">Motivo del Traslado (Opcional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary outline-none"
                  placeholder="Ej. Reabastecimiento sucursal norte"
                />
              </div>

              <button
                onClick={handleTransfer}
                disabled={submitting || items.length === 0}
                className="mt-6 w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                {submitting ? 'Procesando...' : 'Confirmar Traslado'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
