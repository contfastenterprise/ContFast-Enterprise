'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, RefreshCw, Printer, Plus, Check, X,
  Layers, Package, AlertCircle, Edit2, Save,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import BarcodeRenderer from '@/components/ui/BarcodeRenderer';

interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  price: string;
  categoryId: string | null;
  status: string;
}

export default function BarcodeDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with_code' | 'without_code'>('all');
  
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBarcode, setEditBarcode] = useState('');
  const [editFormat, setEditFormat] = useState('code128');

  // Bulk operation status
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [withCodeCount, setWithCodeCount] = useState(0);
  const [withoutCodeCount, setWithoutCodeCount] = useState(0);

  // Printing & Selection states
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelSelectedProduct, setLabelSelectedProduct] = useState<Product | null>(null);
  const [labelPrintMode, setLabelPrintMode] = useState<'single' | 'selected' | 'category' | 'all'>('single');
  const [labelSelectedCategory, setLabelSelectedCategory] = useState('');
  const [labelSize, setLabelSize] = useState('50x30');
  const [labelCustomWidth, setLabelCustomWidth] = useState(50);
  const [labelCustomHeight, setLabelCustomHeight] = useState(30);
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelBrandText, setLabelBrandText] = useState('Latin Doors');
  const [labelVisibleFields, setLabelVisibleFields] = useState({
    brand: true,
    name: true,
    price: true,
    sku: true,
    barcode: true,
    qr: false,
    code: true
  });
  const [barcodeType, setBarcodeType] = useState('code128');

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // 1. Fetch total counts to calculate statistics
      const statsRes = await fetch('/api/v1/products?limit=100000');
      const statsData = await statsRes.json();
      if (statsData.success) {
        const allItems: Product[] = statsData.data || [];
        setTotalCount(allItems.length);
        setWithCodeCount(allItems.filter(p => !!p.barcode).length);
        setWithoutCodeCount(allItems.filter(p => !p.barcode).length);
      }

      // 2. Fetch active page products
      const isCodeFilter = filterType === 'all' ? '' : filterType === 'with_code' ? 'true' : 'false';
      const query = `/api/v1/products?page=${page}&per_page=15&search=${encodeURIComponent(search)}${isCodeFilter !== '' ? `&has_barcode=${isCodeFilter}` : ''}`;
      const res = await fetch(query);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data || []);
        setTotalPages(data.meta?.total_pages || 1);
      }

      const catRes = await fetch('/api/v1/categories');
      const catData = await catRes.json();
      if (catData.success) {
        setCategories(catData.data || []);
      }
    } catch (e) {
      toast.error('Error al cargar catálogo o categorías');
    } finally {
      setLoading(false);
    }
  };

  const getLabelsToRender = () => {
    let itemsToPrint: Product[] = [];
    if (labelPrintMode === 'single' && labelSelectedProduct) {
      itemsToPrint = [labelSelectedProduct];
    } else if (labelPrintMode === 'selected') {
      itemsToPrint = products.filter(p => selectedProductIds.includes(p.id));
    } else if (labelPrintMode === 'category' && labelSelectedCategory) {
      itemsToPrint = products.filter(p => p.categoryId === labelSelectedCategory);
    } else if (labelPrintMode === 'all') {
      itemsToPrint = products;
    }

    const list: Product[] = [];
    itemsToPrint.forEach(p => {
      const q = labelQuantity || 1;
      for (let i = 0; i < q; i++) {
        list.push(p);
      }
    });
    return list;
  };

  const handlePrintLabels = async () => {
    const list = getLabelsToRender();
    if (list.length === 0) {
      toast.error('No hay etiquetas para imprimir');
      return;
    }

    const toastId = toast.loading('Registrando historial de impresión...');
    try {
      const uniqueProds = Array.from(new Set(list.map(p => p.id)));
      const promises = uniqueProds.map(prodId => {
        const qty = list.filter(p => p.id === prodId).length;
        return fetch('/api/v1/products/barcodes/print-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: prodId, quantity: qty })
        });
      });
      await Promise.all(promises);
      toast.success('Historial registrado', { id: toastId });
    } catch (e) {
      console.error('Error logging print action:', e);
      toast.dismiss(toastId);
    }

    setTimeout(() => {
      window.print();
    }, 300);
  };

  useEffect(() => {
    fetchProducts();
  }, [page, filterType]);

  // Debounced search trigger
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchProducts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditBarcode(p.barcode || '');
    setEditFormat('code128');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditBarcode('');
  };

  const handleSaveBarcode = async (productId: string) => {
    const toastId = toast.loading('Guardando código de barras...');
    try {
      const p = products.find(prod => prod.id === productId);
      if (!p) return;

      const res = await fetch(`/api/v1/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          sku: p.sku,
          price: parseFloat(p.price),
          categoryId: p.categoryId,
          status: p.status,
          barcode: editBarcode.trim() || null
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Código guardado correctamente', { id: toastId });
        setEditingId(null);
        fetchProducts();
      } else {
        toast.error(data.error?.message || 'Error al guardar código', { id: toastId });
      }
    } catch (e) {
      toast.error('Error de red al guardar', { id: toastId });
    }
  };

  const handleGenerateInline = async (productId: string) => {
    try {
      const res = await fetch('/api/v1/products/next-barcode');
      const data = await res.json();
      if (data.success && data.barcode) {
        setEditBarcode(data.barcode);
        setEditFormat('code128');
        toast.success('Código autogenerado listo para guardar');
      } else {
        toast.error('No se pudo generar código automático');
      }
    } catch (e) {
      toast.error('Error de conexión al servidor');
    }
  };

  const handleBulkGenerate = async () => {
    if (!confirm('¿Desea autogenerar y asignar códigos secuenciales a TODOS los productos faltantes?')) return;

    setBulkGenerating(true);
    const toastId = toast.loading('Generando códigos de barra en lote...');
    try {
      // Fetch list of all products without barcode
      const res = await fetch('/api/v1/products?limit=100000');
      const data = await res.json();
      if (!data.success) throw new Error('No se pudo leer catálogo');

      const allItems: Product[] = data.data || [];
      const missing = allItems.filter(p => !p.barcode);

      if (missing.length === 0) {
        toast.success('Todos los productos ya cuentan con un código de barra', { id: toastId });
        setBulkGenerating(false);
        return;
      }

      let count = 0;
      for (const p of missing) {
        // Fetch next sequential barcode
        const nextRes = await fetch('/api/v1/products/next-barcode');
        const nextData = await nextRes.json();
        if (nextData.success && nextData.barcode) {
          // Assign barcode to product
          await fetch(`/api/v1/products/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: p.name,
              sku: p.sku,
              price: parseFloat(p.price),
              categoryId: p.categoryId,
              status: p.status,
              barcode: nextData.barcode
            })
          });
          count++;
        }
      }

      toast.success(`Se generaron y asignaron ${count} códigos de barra exitosamente`, { id: toastId });
      fetchProducts();
    } catch (e) {
      toast.error('Error durante la generación masiva', { id: toastId });
    } finally {
      setBulkGenerating(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/products')}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="Volver a Productos"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#003366] font-display flex items-center gap-2">
              <Layers className="h-8 w-8 text-[#c5a059]" />
              Gestión Unificada de Códigos
            </h1>
            <p className="text-slate-500 text-sm mt-1">Crea, edita, audita y previsualiza códigos de barra en un solo panel.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setLabelPrintMode(selectedProductIds.length > 0 ? 'selected' : 'all');
              if (products.length > 0) {
                setLabelSelectedProduct(products[0]);
              }
              setShowLabelModal(true);
            }}
            className="bg-[#c5a059] hover:bg-[#b08e4f] text-[#001e40] font-bold py-2.5 px-5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
          >
            <Printer className="h-4 w-4" />
            {selectedProductIds.length > 0 ? `Imprimir Selección (${selectedProductIds.length})` : 'Imprimir Etiquetas'}
          </button>
          <button
            onClick={handleBulkGenerate}
            disabled={bulkGenerating || loading}
            className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0 disabled:opacity-50"
          >
            {bulkGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Autogenerar Faltantes
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-slate-650"><Package className="h-16 w-16" /></div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total de Productos</p>
          <p className="text-3xl font-bold text-slate-800 font-display">{totalCount}</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-650"><Check className="h-16 w-16" /></div>
          <p className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">Con Código de Barras / QR</p>
          <p className="text-3xl font-bold text-emerald-950 font-display">{withCodeCount}</p>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-rose-650"><AlertCircle className="h-16 w-16" /></div>
          <p className="text-rose-700 text-xs font-bold uppercase tracking-wider mb-1">Sin Código (Pendientes)</p>
          <p className="text-3xl font-bold text-rose-950 font-display">{withoutCodeCount}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg gap-1 self-start">
          <button
            onClick={() => { setFilterType('all'); setPage(1); }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'all' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            Todos
          </button>
          <button
            onClick={() => { setFilterType('with_code'); setPage(1); }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'with_code' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            Con Código
          </button>
          <button
            onClick={() => { setFilterType('without_code'); setPage(1); }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'without_code' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            Sin Código
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, SKU o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-[#c5a059] transition-colors"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="pl-6 py-3.5 text-left w-10">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && products.every(p => selectedProductIds.includes(p.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProductIds(prev => Array.from(new Set([...prev, ...products.map(p => p.id)])));
                      } else {
                        setSelectedProductIds(prev => prev.filter(id => !products.map(p => p.id).includes(id)));
                      }
                    }}
                    className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU / Producto</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código de Barras / QR</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Previsualización</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C5A059]" />
                    Cargando catálogo...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    No se encontraron productos coincidentes.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isEditing = editingId === p.id;
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="pl-6 py-4 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductIds(prev => [...prev, p.id]);
                            } else {
                              setSelectedProductIds(prev => prev.filter(id => id !== p.id));
                            }
                          }}
                          className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">SKU: {p.sku || 'N/A'}</div>
                      </td>
                      
                      <td className="px-5 py-4">
                        {isEditing ? (
                          <div className="flex gap-2 items-center max-w-xs">
                            <input
                              type="text"
                              value={editBarcode}
                              onChange={(e) => setEditBarcode(e.target.value)}
                              className="bg-white border border-slate-350 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:border-[#c5a059] outline-none w-36"
                              placeholder="Código de barra..."
                            />
                            <button
                              type="button"
                              onClick={() => handleGenerateInline(p.id)}
                              className="px-2.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-[10px] font-bold shrink-0 transition-colors"
                              title="Generar Código Automático"
                            >
                              Auto
                            </button>
                            <select
                              value={editFormat}
                              onChange={(e) => setEditFormat(e.target.value)}
                              className="bg-white border border-slate-350 rounded-lg px-2 py-1.5 text-[10px] text-slate-700 outline-none shrink-0"
                            >
                              <option value="code128">Code 128</option>
                              <option value="ean13">EAN-13</option>
                              <option value="qrcode">QR Code</option>
                            </select>
                          </div>
                        ) : (
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                            {p.barcode || 'Sin Código'}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-middle">
                        <div className="flex justify-center">
                          {isEditing && editBarcode ? (
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-100">
                              <BarcodeRenderer value={editBarcode} type={editFormat} height={20} />
                            </div>
                          ) : p.barcode ? (
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-100">
                              <BarcodeRenderer value={p.barcode} type={p.barcode.length > 15 ? 'qrcode' : 'code128'} height={20} />
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold italic">Pendiente de asignación</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveBarcode(p.id)}
                              className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Guardar"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setLabelSelectedProduct(p);
                                setLabelPrintMode('single');
                                setLabelQuantity(1);
                                setShowLabelModal(true);
                              }}
                              disabled={!p.barcode}
                              className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-40 rounded-lg transition-colors"
                              title="Imprimir Etiquetas"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleStartEdit(p)}
                              className="p-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
                              title="Editar o Generar Código"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-t border-slate-200">
            <div className="text-xs text-slate-500 font-medium">
              Mostrando página <span className="text-[#003366] font-bold">{page}</span> de <span className="text-[#003366] font-bold">{totalPages}</span>
              {' '}({filterType === 'all' ? totalCount : filterType === 'with_code' ? withCodeCount : withoutCodeCount} registros en total)
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)} disabled={page === 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex gap-1 mx-2">
                <button className="w-8 h-8 rounded-lg bg-[#C5A059] text-slate-950 font-bold text-xs flex items-center justify-center">
                  {page}
                </button>
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
       </div>

      {/* Diálogo Avanzado de Impresión de Etiquetas */}
      <AnimatePresence>
        {showLabelModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLabelModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row no-print"
            >
              {/* Ajustes */}
              <div className="flex-1 p-6 space-y-5 max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b pb-4">
                  <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                    <Printer className="h-5 w-5 text-[#c5a059]" />
                    Generar Etiquetas de Código de Barras
                  </h3>
                  <button onClick={() => setShowLabelModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Modo de Selección</label>
                    <select
                      value={labelPrintMode}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setLabelPrintMode(val);
                        if (val === 'single' && products.length > 0 && !labelSelectedProduct) {
                          setLabelSelectedProduct(products[0]);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                    >
                      <option value="single">Producto Único</option>
                      <option value="selected">Productos Seleccionados ({selectedProductIds.length})</option>
                      <option value="category">Por Categoría</option>
                      <option value="all">Todo el Catálogo</option>
                    </select>
                  </div>

                  {labelPrintMode === 'category' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Categoría</label>
                      <select
                        value={labelSelectedCategory}
                        onChange={(e) => setLabelSelectedCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                      >
                        <option value="">Todas las categorías</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {labelPrintMode === 'single' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Producto</label>
                      <select
                        value={labelSelectedProduct?.id || ''}
                        onChange={(e) => {
                          const found = products.find(p => p.id === e.target.value);
                          if (found) setLabelSelectedProduct(found);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                      >
                        <option value="">Selecciona...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Formato de Código</label>
                    <select
                      value={barcodeType}
                      onChange={(e) => setBarcodeType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                    >
                      <option value="code128">Code 128 (Alfanumérico)</option>
                      <option value="ean13">EAN-13 (13 dígitos)</option>
                      <option value="ean8">EAN-8 (8 dígitos)</option>
                      <option value="upca">UPC-A (12 dígitos)</option>
                      <option value="qrcode">Código QR</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Tamaño Etiqueta</label>
                    <select
                      value={labelSize}
                      onChange={(e) => setLabelSize(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                    >
                      <option value="30x20">30x20 mm (Mini)</option>
                      <option value="50x25">50x25 mm</option>
                      <option value="50x30">50x30 mm (Estándar)</option>
                      <option value="60x40">60x40 mm (Grande)</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>

                  {labelSize === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 col-span-1 md:col-span-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block">Ancho (mm)</label>
                        <input
                          type="number"
                          value={labelCustomWidth}
                          onChange={(e) => setLabelCustomWidth(parseInt(e.target.value) || 50)}
                          className="w-full bg-slate-50 border border-slate-350 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block">Alto (mm)</label>
                        <input
                          type="number"
                          value={labelCustomHeight}
                          onChange={(e) => setLabelCustomHeight(parseInt(e.target.value) || 30)}
                          className="w-full bg-slate-50 border border-slate-350 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Cantidad por Producto</label>
                    <input
                      type="number"
                      min="1"
                      value={labelQuantity}
                      onChange={(e) => setLabelQuantity(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Marca / Empresa</label>
                    <input
                      type="text"
                      value={labelBrandText}
                      onChange={(e) => setLabelBrandText(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none"
                      placeholder="Ej. ContFast Enterprise"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Campos Visibles</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.brand}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, brand: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Marca/Empresa
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.name}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, name: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Nombre Producto
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.price}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, price: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Precio Venta
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.sku}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, sku: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      SKU Código
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.barcode}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, barcode: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Código Barras
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.qr}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, qr: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Código QR
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t">
                  <button onClick={() => setShowLabelModal(false)} className="px-4 py-2 border border-slate-350 text-slate-700 font-bold text-xs rounded-lg transition-colors bg-white hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button onClick={handlePrintLabels} className="bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs px-5 py-2 rounded-lg shadow-md transition-colors flex items-center gap-1.5">
                    <Printer className="h-4 w-4" />
                    Mandar a Imprimir
                  </button>
                </div>
              </div>

              {/* Previsualización */}
              <div className="w-full md:w-80 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 p-6 flex flex-col items-center justify-center space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Vista Previa</h4>
                {labelSelectedProduct ? (
                  <div className="flex flex-col items-center justify-center p-3 border border-slate-300 rounded bg-white shadow-lg relative overflow-hidden select-none max-w-full" style={{
                    width: `${labelSize === 'custom' ? labelCustomWidth * 3.5 : parseInt(labelSize.split('x')[0]) * 3.5}px`,
                    height: `${labelSize === 'custom' ? labelCustomHeight * 3.5 : parseInt(labelSize.split('x')[1]) * 3.5}px`,
                  }}>
                    {labelVisibleFields.brand && labelBrandText && (
                      <div className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1 mb-0.5">{labelBrandText}</div>
                    )}
                    {labelVisibleFields.name && (
                      <div className="text-[7.5px] font-bold text-slate-800 line-clamp-2 text-center leading-normal mb-0.5">{labelSelectedProduct.name}</div>
                    )}
                    {labelVisibleFields.sku && labelSelectedProduct.sku && (
                      <div className="text-[6.5px] font-mono text-slate-400 mb-0.5">SKU: {labelSelectedProduct.sku}</div>
                    )}
                    {labelVisibleFields.barcode && (
                      <div className="my-0.5 max-w-full font-mono">
                        {labelSelectedProduct.barcode ? (
                          <BarcodeRenderer value={labelSelectedProduct.barcode} type={barcodeType} height={18} width={1.2} showText={labelVisibleFields.code} />
                        ) : (
                          <div className="text-[8px] text-rose-500 font-bold border border-dashed border-rose-200 bg-rose-50 px-1 py-0.5 rounded text-center">
                            [ Sin código asignado ]
                          </div>
                        )}
                      </div>
                    )}
                    {labelVisibleFields.qr && (
                      <div className="my-0.5">
                        <BarcodeRenderer value={JSON.stringify({
                          id: labelSelectedProduct.id,
                          codigo: labelSelectedProduct.barcode || labelSelectedProduct.sku || '',
                          nombre: labelSelectedProduct.name,
                          precio: parseFloat(labelSelectedProduct.price)
                        })} type="qrcode" height={22} />
                      </div>
                    )}
                    {labelVisibleFields.price && (
                      <div className="text-[8.5px] font-extrabold text-[#003366] mt-0.5">RD$ {parseFloat(labelSelectedProduct.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic">Selecciona un producto...</div>
                )}
                <p className="text-[9px] text-slate-400 text-center max-w-[200px]">
                  Vista escalada. La impresión física se adaptará al tamaño real en milímetros.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Elementos Imprimibles Ocultos */}
      <div className="print-area" style={{ display: 'none' }}>
        <style>{`
          @media print {
            body > *:not(.print-area) {
              display: none !important;
            }
            .print-area {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100% !important;
              height: auto !important;
              background: white !important;
            }
            .label-card {
              width: ${labelSize === 'custom' ? labelCustomWidth : labelSize.split('x')[0]}mm !important;
              height: ${labelSize === 'custom' ? labelCustomHeight : labelSize.split('x')[1]}mm !important;
              padding: 1.5mm;
              box-sizing: border-box;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              overflow: hidden;
              border: none !important;
              box-shadow: none !important;
              margin: 0 !important;
              text-align: center;
              background: white !important;
            }
          }
        `}</style>
        {getLabelsToRender().map((p, idx) => {
          const qrData = JSON.stringify({
            id: p.id,
            codigo: p.barcode || p.sku || '',
            nombre: p.name,
            precio: parseFloat(p.price)
          });
          
          return (
            <div key={idx} className="label-card">
              {labelVisibleFields.brand && labelBrandText && (
                <div className="text-[7px] font-bold uppercase tracking-wider text-slate-600 line-clamp-1 mb-0.5">{labelBrandText}</div>
              )}
              {labelVisibleFields.name && (
                <div className="text-[8px] font-bold text-slate-900 line-clamp-2 leading-tight mb-0.5">{p.name}</div>
              )}
              {labelVisibleFields.sku && p.sku && (
                <div className="text-[7px] font-mono text-slate-500 mb-0.5">SKU: {p.sku}</div>
              )}
              {labelVisibleFields.barcode && p.barcode && (
                <div className="my-0.5 max-w-full">
                  <BarcodeRenderer value={p.barcode} type={barcodeType} height={18} width={1.2} showText={labelVisibleFields.code} />
                </div>
              )}
              {labelVisibleFields.qr && (
                <div className="my-0.5">
                  <BarcodeRenderer value={qrData} type="qrcode" height={22} />
                </div>
              )}
              {labelVisibleFields.price && (
                <div className="text-[9px] font-extrabold text-[#003366] mt-0.5">RD$ {parseFloat(p.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
