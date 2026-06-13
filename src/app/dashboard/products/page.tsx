'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Package, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Archive, DollarSign, Building2, Layers } from 'lucide-react';
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
  priceConsumidor?: string;
  priceMayorista?: string;
  priceProveedor?: string;
  status: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryLevels, setInventoryLevels] = useState<{ warehouseId: string, warehouseName: string, quantity: string, availableQuantity?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });

  // Warehouses state
  const [warehouses, setWarehouses] = useState<{ id: string, name: string }[]>([]);
  const [inlineAdjustForm, setInlineAdjustForm] = useState<Record<string, string>>({});
  const [submittingAdjustId, setSubmittingAdjustId] = useState<string | null>(null);

  // Form state
  const [manualPricesEnabled, setManualPricesEnabled] = useState(false);
  const [showPricesModal, setShowPricesModal] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    categoryId: '',
    unitOfMeasure: 'unidad',
    cost: '',
    price: '',
    priceConsumidor: '',
    priceMayorista: '',
    priceProveedor: '',
    status: 'active'
  });

  // Autocálculo de precios cuando cambia el costo (si no están manuales)
  useEffect(() => {
    if (!manualPricesEnabled && formData.cost) {
      const costNum = Number(formData.cost);
      if (!isNaN(costNum) && costNum >= 0) {
        const pConsumidor = (costNum * 1.20).toFixed(2);
        const pMayorista = (costNum * 1.15).toFixed(2);
        const pProveedor = (costNum * 1.10).toFixed(2);

        // Evitamos actualización infinita verificando si hay cambios reales
        if (formData.priceConsumidor !== pConsumidor ||
          formData.priceMayorista !== pMayorista ||
          formData.priceProveedor !== pProveedor ||
          formData.price !== pConsumidor) {
          setFormData(prev => ({
            ...prev,
            price: pConsumidor,
            priceConsumidor: pConsumidor,
            priceMayorista: pMayorista,
            priceProveedor: pProveedor
          }));
        }
      }
    }
  }, [formData.cost, manualPricesEnabled]);

  const fetchProducts = async (searchQuery = '', catId = selectedCategory) => {
    setLoading(true);
    try {
      let url = `/api/v1/products?search=${searchQuery}`;
      if (catId) url += `&categoryId=${catId}`;
      const res = await fetch(url);
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

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/v1/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/v1/warehouses');
      const data = await res.json();
      if (data.success) {
        setWarehouses(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchWarehouses();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(search);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const openNewModal = () => {
    setEditId(null);
    setManualPricesEnabled(false);
    setFormData({ sku: '', categoryId: '', name: '', unitOfMeasure: 'unidad', cost: '', price: '', priceConsumidor: '', priceMayorista: '', priceProveedor: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (product: any) => {
    setEditId(product.id);
    setManualPricesEnabled(false); // Activado por defecto (autocalcular)
    setFormData({
      sku: product.sku || '',
      categoryId: product.categoryId || '',
      name: product.name,
      unitOfMeasure: product.unitOfMeasure,
      cost: product.cost,
      price: product.price,
      priceConsumidor: product.priceConsumidor || product.price,
      priceMayorista: product.priceMayorista || product.price,
      priceProveedor: product.priceProveedor || product.price,
      status: product.status
    });
    setShowModal(true);
  };

  const openInventoryModal = async (product: Product) => {
    setSelectedProduct(product);
    setShowInventoryModal(true);
    setInventoryLevels([]);
    try {
      const res = await fetch(`/api/v1/products/${product.id}/inventory`);
      const data = await res.json();
      if (data.success) {
        setInventoryLevels(data.data);
      }
    } catch (error) {
      toast.error('Error al cargar inventario');
    }
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
        price: Number(formData.priceConsumidor || formData.price),
        priceConsumidor: Number(formData.priceConsumidor || formData.price),
        priceMayorista: Number(formData.priceMayorista || formData.price),
        priceProveedor: Number(formData.priceProveedor || formData.price)
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
        fetchProducts(search, selectedCategory);
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name) return;
    setSubmittingCategory(true);
    try {
      const res = await fetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryForm.name, description: categoryForm.description, status: 'active' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Categoría creada exitosamente');
        setCategoryForm({ name: '', description: '' });
        setShowCategoryModal(false);
        // Refresh categories and automatically select the new one
        await fetchCategories();
        setFormData(prev => ({ ...prev, categoryId: data.data.id }));
      } else {
        toast.error(data.error?.message || 'Error al crear categoría');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmittingCategory(false);
    }
  };

  const handleInlineAdjust = async (warehouseId: string) => {
    if (!selectedProduct) return;
    const newQuantity = inlineAdjustForm[warehouseId];
    if (newQuantity === undefined || newQuantity === '') return;

    setSubmittingAdjustId(warehouseId);
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          productId: selectedProduct.id,
          newQuantity,
          reason: 'Ajuste desde el dashboard de inventario'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Inventario actualizado');
        // Limpiar el campo del formulario de esa fila para que vuelva a mostrar el valor en modo texto
        setInlineAdjustForm(prev => {
          const updated = { ...prev };
          delete updated[warehouseId];
          return updated;
        });
        
        // Refresh inventory levels
        const invRes = await fetch(`/api/v1/products/${selectedProduct.id}/inventory`);
        const invData = await invRes.json();
        if (invData.success) {
          setInventoryLevels(invData.data);
        }
      } else {
        toast.error(data.error?.message || 'Error al actualizar');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmittingAdjustId(null);
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

    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">

      {/* Header section with title and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-display flex items-center gap-2">
            <Package className="h-8 w-8 text-[#c5a059]" />
            Catálogo de Productos
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Gestiona tu inventario, precios y servicios facturables.</p>
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
        {/* Card 1: Total Catálogo (Blue) */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-600 group-hover:scale-110 transition-transform"><Package className="h-16 w-16" /></div>
          <p className="text-blue-800 text-sm font-semibold mb-1">Total en Catálogo</p>
          <p className="text-3xl font-bold text-blue-950 font-display">{totalItems}</p>
        </div>

        {/* Card 2: Valor Inventario (Emerald) */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-600 group-hover:scale-110 transition-transform"><DollarSign className="h-16 w-16" /></div>
          <p className="text-emerald-800 text-sm font-semibold mb-1">Valor de Inventario (Costos)</p>
          <p className="text-3xl font-bold text-emerald-950 font-display">{formatCurrency(totalValue)}</p>
        </div>

        {/* Card 3: Stock Bajo (Amber) */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-600 group-hover:scale-110 transition-transform"><AlertTriangle className="h-16 w-16" /></div>
          <p className="text-amber-800 text-sm font-semibold mb-1">Stock Bajo</p>
          <p className="text-3xl font-bold text-amber-950 font-display">0</p>
        </div>
      </div>

      {/* Search and Table Container */}
      <div className="bg-[#0b1120] border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-outline-variant/30 flex flex-col sm:flex-row gap-4 items-center justify-between bg-surface-container-low/50">
          <div className="flex gap-4 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-on-surface-variant/50" />
              <input
                type="text"
                placeholder="Buscar por código, nombre o código de barras..."
                value={search}
                onChange={handleSearch}
                className="w-full bg-white border-none rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-primary shadow-sm outline-none transition-shadow"
              />
            </div>
            <div className="w-48 hidden md:block">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  fetchProducts(search, e.target.value);
                }}
                className="w-full bg-white border-none rounded-2xl px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-primary shadow-sm outline-none"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={() => fetchProducts(search)} className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/80 border-b border-outline-variant/30 text-on-surface-variant text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">SKU / Código</th>
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold">Medida</th>
                <th className="p-4 font-semibold text-right">Costo</th>
                <th className="p-4 font-semibold text-right">Precio Venta</th>
                <th className="p-4 font-semibold text-center">Estado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20/50 bg-surface-container-low">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant/70">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-500" />
                    Cargando catálogo...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant/70">
                    <Archive className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    No se encontraron productos.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-high/30 transition-colors group">
                    <td className="p-4 text-sm font-mono text-on-surface-variant">{p.sku || 'N/A'}</td>
                    <td className="p-4 text-sm font-semibold text-primary">{p.name}</td>
                    <td className="p-4 text-sm text-on-surface-variant capitalize">{p.unitOfMeasure}</td>
                    <td className="p-4 text-sm text-on-surface-variant text-right">{formatCurrency(p.cost)}</td>
                    <td className="p-4 text-sm font-bold text-emerald-400 text-right">{formatCurrency(p.price)}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/10 text-on-surface-variant border border-slate-500/20'
                        }`}>
                        {p.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openInventoryModal(p)} title="Ver Inventario" className="p-2 text-on-surface-variant hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors">
                          <Layers className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEditModal(p)} title="Editar" className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-highest rounded-lg transition-colors">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm h-8"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-[#003366] bg-[#001733]">
                <h2 className="text-xl font-bold text-white font-display">
                  {editId ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-primary">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 ">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Código SKU <span className="text-on-surface-variant/70 font-normal text-xs">(Opcional)</span></label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors font-mono"
                      placeholder="PROD-001"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Nombre del Producto <span className="text-[#c5a059]">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors"
                      placeholder="Ej. Puerta Caoba 100*200 cm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-primary">Categoría</label>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="text-xs text-[#c5a059] hover:text-[#d4b069] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Nueva
                      </button>
                    </div>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors"
                    >
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Costo de Compra <span className="text-[#c5a059]">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg pl-12 pr-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2 bg-card-bg p-4 rounded-xl border border-[#003366]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-primary">Precios de Venta</label>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-on-surface-variant">
                          <input
                            type="checkbox"
                            checked={!manualPricesEnabled}
                            onChange={(e) => setManualPricesEnabled(!e.target.checked)}
                            className="rounded border-[#c5a059] text-primary focus:ring-primary"
                          />
                          Autocalcular
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setManualPricesEnabled(true);
                            setShowPricesModal(true);
                          }}
                          className="text-xs flex items-center gap-1 bg-[#c5a059] text-[#001e40] px-3 py-1.5 rounded-md font-bold hover:bg-[#d4b069] transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                          {manualPricesEnabled ? 'Editar Precios' : 'Ajustar Manual'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <label className="text-xs text-on-surface-variant font-medium block mb-1">P. Consumidor (+20%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-500 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceConsumidor || formData.price}
                          className=" mr-3 w-full bg-surface-container-high border border-outline/50 rounded-lg pl-12 pr-4 py-2 text-primary opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-on-surface-variant font-medium block mb-1">P. Mayorista (+15%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-500 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceMayorista}
                          className="w-full bg-surface-container-high border border-outline/50 rounded-lg pl-12 pr-4 py-2 text-primary opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-on-surface-variant font-medium block mb-1">P. Proveedor (+10%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-500 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceProveedor}
                          className="w-full bg-surface-container-high border border-outline/50 rounded-lg pl-12 pr-4 py-2 text-primary opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Unidad de Medida <span className="text-[#c5a059]">*</span></label>
                    <select
                      value={formData.unitOfMeasure}
                      onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="unidad">Unidad</option>
                      <option value="pie">Pie (pie)</option>
                      <option value="metro">Metro (m)</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Estado</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors"
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

      {/* Sub-Modal New Category */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCategoryModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#0b1120]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-[#c5a059]" /> Nueva Categoría
                </h3>
                <button onClick={() => setShowCategoryModal(false)} className="text-on-surface-variant hover:text-primary">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCategory} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary">Nombre de Categoría <span className="text-[#c5a059]">*</span></label>
                  <input
                    type="text"
                    required
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full bg-[#0b1120] border border-outline/50 rounded-lg px-4 py-2.5 text-primary focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Ej. Herramientas"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary">Descripción</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full bg-[#0b1120] border border-outline/50 rounded-lg px-4 py-2.5 text-primary focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Opcional..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline/20">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="px-4 py-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCategory}
                    className="bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {submittingCategory ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Guardar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal Edit Prices */}
      <AnimatePresence>
        {showPricesModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowPricesModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#0b1120]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#c5a059]" /> Edición Manual de Precios
                </h3>
                <button onClick={() => setShowPricesModal(false)} className="text-on-surface-variant hover:text-primary">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-3 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    Al guardar estos precios, el auto-cálculo automático (20%, 15%, 10%) basado en el costo se desactivará para no sobrescribir tus ajustes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Consumidor (Venta Regular)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceConsumidor || formData.price}
                        onChange={(e) => {
                          setFormData({ ...formData, priceConsumidor: e.target.value, price: e.target.value });
                        }}
                        className="w-full bg-[#0b1120] border border-outline/50 rounded-lg pl-14 pr-4 py-2.5 text-primary focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Mayorista</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceMayorista}
                        onChange={(e) => setFormData({ ...formData, priceMayorista: e.target.value })}
                        className="w-full bg-[#0b1120] border border-outline/50 rounded-lg pl-14 pr-4 py-2.5 text-primary focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Proveedor / Distribuidor</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceProveedor}
                        onChange={(e) => setFormData({ ...formData, priceProveedor: e.target.value })}
                        className="w-full bg-[#0b1120] border border-outline/50 rounded-lg pl-14 pr-4 py-2.5 text-primary focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPricesModal(false)}
                    className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors w-full justify-center"
                  >
                    Confirmar Precios
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal Inventory */}
      <AnimatePresence>
        {showInventoryModal && selectedProduct && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInventoryModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#0b1120]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#c5a059]" /> Inventario: {selectedProduct.name}
                </h3>
                <button onClick={() => setShowInventoryModal(false)} className="text-on-surface-variant hover:text-primary">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-0 overflow-y-auto max-h-[70vh]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-low/80 border-b border-[#003366] sticky top-0 z-10">
                    <tr>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider">Almacén</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right">Físico</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right">Disponible</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right w-40">Ajustar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 bg-surface-container-highest">
                    {warehouses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-on-surface-variant/70">
                          <Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />
                          No hay almacenes configurados en el sistema.
                        </td>
                      </tr>
                    ) : (
                      warehouses.map((w) => {
                        const level = inventoryLevels.find(l => l.warehouseId === w.id);
                        const currentQuantity = level ? Number(level.quantity).toFixed(2) : '0.00';
                        const availableQuantity = level && level.availableQuantity !== undefined
                          ? Number(level.availableQuantity).toFixed(2)
                          : currentQuantity;
                        
                        return (
                          <tr key={w.id} className="hover:bg-surface-container-low/30 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-lg text-primary flex-shrink-0">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <span className="font-bold text-on-surface text-sm">{w.name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <span className="block text-md font-mono text-emerald-400">
                                {currentQuantity}
                              </span>
                              <span className="text-[10px] text-on-surface-variant capitalize">{selectedProduct.unitOfMeasure}s</span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="block text-md font-mono font-bold text-amber-400">
                                {availableQuantity}
                              </span>
                              <span className="text-[10px] text-on-surface-variant">Disponibles</span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={inlineAdjustForm[w.id] !== undefined ? inlineAdjustForm[w.id] : currentQuantity}
                                  onChange={(e) => setInlineAdjustForm({ ...inlineAdjustForm, [w.id]: e.target.value })}
                                  className="w-20 bg-[#0b1120] border border-outline/50 rounded-lg px-2 py-1.5 text-sm text-primary focus:border-[#c5a059] outline-none text-right font-mono"
                                />
                                <button
                                  onClick={() => handleInlineAdjust(w.id)}
                                  disabled={submittingAdjustId === w.id || inlineAdjustForm[w.id] === undefined || inlineAdjustForm[w.id] === currentQuantity}
                                  title="Guardar cambio"
                                  className="p-1.5 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] rounded-md transition-colors disabled:opacity-30 disabled:grayscale"
                                >
                                  {submittingAdjustId === w.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
