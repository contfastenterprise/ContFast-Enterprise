'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, RefreshCw, Printer, Plus, Check, X,
  Layers, Package, AlertCircle, Edit2, Save
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
    } catch (e) {
      toast.error('Error al cargar catálogo de productos');
    } finally {
      setLoading(false);
    }
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

        <button
          onClick={handleBulkGenerate}
          disabled={bulkGenerating || loading}
          className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0 disabled:opacity-50"
        >
          {bulkGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Autogenerar Faltantes
        </button>
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
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU / Producto</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código de Barras / QR</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Previsualización</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C5A059]" />
                    Cargando catálogo...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-400">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    No se encontraron productos coincidentes.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isEditing = editingId === p.id;
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
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
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
                            title="Editar o Generar Código"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
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
            <button
              onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
              disabled={page === totalPages}
              className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
