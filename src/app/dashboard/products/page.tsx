'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Package, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Archive, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Product {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  cost: string;
  price: string;
  status: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    unitOfMeasure: 'unidad',
    cost: '',
    price: '',
    status: 'active'
  });

  const fetchProducts = async (searchQuery = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/products?search=${searchQuery}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      } else {
        toast.error('Error al cargar productos');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(search);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const openNewModal = () => {
    setEditId(null);
    setFormData({ sku: '', name: '', unitOfMeasure: 'unidad', cost: '', price: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditId(product.id);
    setFormData({
      sku: product.sku || '',
      name: product.name,
      unitOfMeasure: product.unitOfMeasure,
      cost: product.cost,
      price: product.price,
      status: product.status
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/v1/products/${editId}` : '/api/v1/products';
      
      const payload = {
        ...formData,
        cost: Number(formData.cost),
        price: Number(formData.price)
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(editId ? 'Producto actualizado' : 'Producto creado exitosamente');
        setShowModal(false);
        fetchProducts(search);
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(Number(amount));
  };

  // Metrics calculation (Mock/derived from current page for demo purposes)
  const totalItems = products.length; // In real app, use meta.total
  const totalValue = products.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
        
        {/* Header section with title and CTA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white font-display flex items-center gap-2">
              <Package className="h-8 w-8 text-[#c5a059]" />
              Catálogo de Productos
            </h1>
            <p className="text-slate-400 text-sm mt-1">Gestiona tu inventario, precios y servicios facturables.</p>
          </div>
          <button
            onClick={openNewModal}
            className="flex items-center justify-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-5 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg shadow-amber-900/20"
          >
            <Plus className="h-4 w-4" /> Nuevo Producto
          </button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#001e40] border border-[#003366] rounded-xl p-5 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Package className="h-16 w-16" /></div>
             <p className="text-[#a7c8ff] text-sm font-semibold mb-1">Total en Catálogo</p>
             <p className="text-3xl font-bold text-white font-display">{totalItems}</p>
          </div>
          <div className="bg-[#001e40] border border-[#003366] rounded-xl p-5 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500"><DollarSign className="h-16 w-16" /></div>
             <p className="text-[#a7c8ff] text-sm font-semibold mb-1">Valor de Inventario (Costos)</p>
             <p className="text-3xl font-bold text-emerald-400 font-display">{formatCurrency(totalValue)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500"><Archive className="h-16 w-16" /></div>
             <p className="text-slate-400 text-sm font-semibold mb-1">Stock Bajo</p>
             <p className="text-3xl font-bold text-amber-500 font-display">0</p>
          </div>
        </div>

        {/* Search and Table Container */}
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl shadow-xl overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900/50">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, SKU o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-amber-500 outline-none transition-colors"
              />
            </div>
            <button onClick={() => fetchProducts(search)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">SKU / Código</th>
                  <th className="p-4 font-semibold">Nombre</th>
                  <th className="p-4 font-semibold">Unidad</th>
                  <th className="p-4 font-semibold text-right">Costo</th>
                  <th className="p-4 font-semibold text-right">Precio Venta</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-500" />
                      Cargando catálogo...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <Archive className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      No se encontraron productos.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="p-4 text-sm font-mono text-slate-400">{p.sku || 'N/A'}</td>
                      <td className="p-4 text-sm font-semibold text-white">{p.name}</td>
                      <td className="p-4 text-sm text-slate-400 capitalize">{p.unitOfMeasure}</td>
                      <td className="p-4 text-sm text-slate-400 text-right">{formatCurrency(p.cost)}</td>
                      <td className="p-4 text-sm font-bold text-emerald-400 text-right">{formatCurrency(p.price)}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                          p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}>
                          {p.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(p)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Modal */}
        <AnimatePresence>
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowModal(false)}
              />
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-2xl bg-[#001e40] border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="flex justify-between items-center p-6 border-b border-[#003366] bg-[#001733]">
                  <h2 className="text-xl font-bold text-white font-display">
                    {editId ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                  </h2>
                  <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Código SKU <span className="text-slate-500 font-normal text-xs">(Opcional)</span></label>
                      <input
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        className="w-full bg-[#001122] border border-[#003366] rounded-lg px-4 py-2.5 text-white focus:border-[#c5a059] outline-none transition-colors font-mono"
                        placeholder="PROD-001"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Nombre del Producto <span className="text-[#c5a059]">*</span></label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-[#001122] border border-[#003366] rounded-lg px-4 py-2.5 text-white focus:border-[#c5a059] outline-none transition-colors"
                        placeholder="Ej. Puerta Caoba 2x1m"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Costo de Compra <span className="text-[#c5a059]">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">RD$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.cost}
                          onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                          className="w-full bg-[#001122] border border-[#003366] rounded-lg pl-10 pr-4 py-2.5 text-white focus:border-[#c5a059] outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Precio de Venta Base <span className="text-[#c5a059]">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">RD$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          className="w-full bg-[#001122] border border-[#003366] rounded-lg pl-10 pr-4 py-2.5 text-emerald-400 font-bold focus:border-[#c5a059] outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Unidad de Medida <span className="text-[#c5a059]">*</span></label>
                      <select
                        value={formData.unitOfMeasure}
                        onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                        className="w-full bg-[#001122] border border-[#003366] rounded-lg px-4 py-2.5 text-white focus:border-[#c5a059] outline-none transition-colors appearance-none"
                      >
                        <option value="unidad">Unidad</option>
                        <option value="servicio">Servicio</option>
                        <option value="kilo">Kilogramo (kg)</option>
                        <option value="libra">Libra (lb)</option>
                        <option value="litro">Litro (L)</option>
                        <option value="metro">Metro (m)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#a7c8ff]">Estado</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full bg-[#001122] border border-[#003366] rounded-lg px-4 py-2.5 text-white focus:border-[#c5a059] outline-none transition-colors appearance-none"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-[#003366]">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-5 py-2.5 text-slate-300 hover:text-white font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                      {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                      {editId ? 'Guardar Cambios' : 'Registrar Producto'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
}
