'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Package, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Archive, DollarSign, Building2, Layers, Printer, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';


interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

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
    barcode: '',
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

  const fetchProducts = async (searchQuery = search, catId = selectedCategory, pageNum = 1) => {
    setLoading(true);
    try {
      let url = `/api/v1/products?search=${searchQuery}&page=${pageNum}&per_page=20`;
      if (catId) url += `&categoryId=${catId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        if (data.meta) {
          setPage(data.meta.page);
          setTotalPages(data.meta.total_pages);
          setTotalItems(data.meta.total);
        }
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
    fetchProducts('', selectedCategory, 1);
    fetchCategories();
    fetchWarehouses();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(search, selectedCategory, 1);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const openNewModal = () => {
    setEditId(null);
    setManualPricesEnabled(false);
    setFormData({ sku: '', barcode: '', categoryId: '', name: '', unitOfMeasure: 'unidad', cost: '', price: '', priceConsumidor: '', priceMayorista: '', priceProveedor: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (product: any) => {
    setEditId(product.id);
    setManualPricesEnabled(false); // Activado por defecto (autocalcular)
    setFormData({
      sku: product.sku || '',
      barcode: product.barcode || '',
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

  const handlePrintList = async () => {
    const toastId = toast.loading('Preparando plantilla de impresión...');
    try {
      const res = await fetch('/api/v1/company/settings');
      const settingsData = await res.json();
      const company = settingsData.data || {};
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Latin Doors e-CF'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Catálogo de Productos - ${company.companyName || 'Latin Doors e-CF'}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 30px; line-height: 1.4; font-size: 13px; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 20px; }
              .company-info { font-size: 12px; color: #555; line-height: 1.4; }
              .doc-info { text-align: right; }
              .subtitle { font-size: 16pt; color: #003366; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 9px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8f9fa; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; font-size: 11px; }
              .font-bold { font-weight: bold; }
              .footer { margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-info">
                ${logoHtml}
                ${companyTitleHtml}
                ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
                ${company.address ? `<div>${company.address}</div>` : ''}
              </div>
              <div class="doc-info">
                <div class="subtitle">CATÁLOGO DE PRODUCTOS</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Productos Filtrados:</strong> ${products.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>SKU / Código</th>
                  <th>Nombre</th>
                  <th>Medida</th>
                  <th class="text-right">Costo</th>
                  <th class="text-right">Precio Venta</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p => `
                  <tr>
                    <td class="font-mono">${p.sku || 'N/A'}</td>
                    <td class="font-bold">${p.name}</td>
                    <td style="text-transform: capitalize;">${p.unitOfMeasure}</td>
                    <td class="text-right">${formatCurrency(p.cost)}</td>
                    <td class="text-right font-bold" style="color: #16a34a;">${formatCurrency(p.price)}</td>
                    <td class="text-center">
                      <span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; background-color: ${p.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${p.status === 'active' ? '#137333' : '#5f6368'};">
                        ${p.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              Reporte de Inventario - Generado por ContFast Enterprise
            </div>
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.success('Impresión preparada con éxito', { id: toastId });
    } catch (err) {
      toast.error('Error al preparar impresión', { id: toastId });
    }
  };

  // Metrics calculation (Mock/derived from current page for demo purposes)
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
          className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Producto
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
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
          <div className="flex gap-4 flex-1">
            <div className="flex-1">
              <SearchBar
                placeholder="Buscar por código, nombre o código de barras..."
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  fetchProducts(val, selectedCategory);
                }}
              />
            </div>
            <div className="w-48 hidden md:block">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  fetchProducts(search, e.target.value);
                }}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary shadow-sm outline-none"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintList}
              className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-350 px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Imprimir listado filtrado"
            >
              <Printer className="w-4 h-4 text-[#c5a059]" />
              <span>Imprimir</span>
            </button>
            <button onClick={() => fetchProducts(search, selectedCategory, page)} className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">SKU / Código</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Medida</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Costo</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Precio Venta</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C5A059]" />
                    Cargando catálogo...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Archive className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    No se encontraron productos.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                    <td className="px-4 py-2 align-middle text-xs font-mono text-slate-700">
                      <div>{p.sku || 'N/A'}</div>
                      {p.barcode && (
                        <div className="text-[10px] text-slate-400 font-sans mt-0.5" title="Código de Barra">
                          CB: {p.barcode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle text-xs font-semibold text-[#003366]">{p.name}</td>
                    <td className="px-4 py-2 align-middle text-xs text-slate-600 capitalize">{p.unitOfMeasure}</td>
                    <td className="px-4 py-2 align-middle text-xs text-slate-700 text-right">{formatCurrency(p.cost)}</td>
                    <td className="px-4 py-2 align-middle text-xs font-bold text-[#003366] text-right">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-2 align-middle text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                        {p.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openInventoryModal(p)} title="Ver Inventario" className="p-1.5 text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
                          <Layers className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEditModal(p)} title="Editar" className="p-1.5 text-slate-500 hover:text-[#003366] hover:bg-[#003366]/5 rounded-lg transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-500 font-medium">
            Mostrando <span className="font-bold text-slate-800">{products.length}</span> de <span className="font-bold text-slate-800">{totalItems}</span> productos
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => fetchProducts(search, selectedCategory, page - 1)}
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
                onClick={() => fetchProducts(search, selectedCategory, page + 1)}
                type="button"
                className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          )}
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
              className="relative w-full max-w-3xl bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-[#003366] bg-[#001733]">
                <h2 className="text-xl font-bold text-white font-display">
                  {editId ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Código SKU <span className="text-slate-500 font-normal text-xs">(Opcional)</span></label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors font-mono"
                      placeholder="PROD-001"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Código de Barra <span className="text-slate-500 font-normal text-xs">(Opcional)</span></label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors font-mono"
                      placeholder="7501234567890"
                    />
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-sm font-semibold text-[#001e40]">Nombre del Producto <span className="text-[#c5a059]">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                      placeholder="Ej. Puerta Caoba 100*200 cm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-[#001e40]">Categoría <span className="text-[#c5a059]">*</span></label>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="text-xs text-[#c5a059] hover:text-[#d4b069] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Nueva
                      </button>
                    </div>
                    <select
                      required
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                    >
                      <option value="">Selecciona una categoría...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center min-h-[20px]">
                      <label className="text-sm font-semibold text-[#001e40]">Costo de Compra <span className="text-[#c5a059]">*</span></label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-[#001e40]">Precios de Venta</label>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-md shadow-sm" title="Importante: Los precios no incluyen ITBIS">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Sin ITBIS</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#001e40]">
                          <input
                            type="checkbox"
                            checked={!manualPricesEnabled}
                            onChange={(e) => setManualPricesEnabled(!e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
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
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Consumidor (+20%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceConsumidor || formData.price}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Mayorista (+15%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceMayorista}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Proveedor (+10%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceProveedor}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Unidad de Medida <span className="text-[#c5a059]">*</span></label>
                    <select
                      value={formData.unitOfMeasure}
                      onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="unidad">Unidad</option>
                      <option value="pie">Pie (pie)</option>
                      <option value="metro">Metro (m)</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Estado</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowModal(false)}
                    className="flex items-center gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-semibold border border-rose-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {editId ? 'Guardar Cambios' : 'Registrar Producto'}
                  </Button>
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
                <button onClick={() => setShowCategoryModal(false)} className="text-white/70 hover:text-white cursor-pointer">
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
                    className="w-full bg-white border border-outline/50 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Ej. Herramientas"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary">Descripción</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full bg-white border border-outline/50 rounded-lg px-4 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Opcional..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline/20">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCategoryModal(false)}
                    className="flex items-center gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-semibold border border-rose-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={submittingCategory}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer"
                  >
                    {submittingCategory ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Guardar
                  </Button>
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
                <button onClick={() => setShowPricesModal(false)} className="text-white/70 hover:text-white cursor-pointer">
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
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
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
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
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
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowPricesModal(false)}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer w-full justify-center"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Confirmar Precios
                  </Button>
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
              className="relative w-full max-w-5xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
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
                                  step="1"
                                  value={inlineAdjustForm[w.id] !== undefined ? inlineAdjustForm[w.id] : currentQuantity}
                                  onChange={(e) => setInlineAdjustForm({ ...inlineAdjustForm, [w.id]: e.target.value })}
                                  className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] outline-none text-right font-mono"
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
