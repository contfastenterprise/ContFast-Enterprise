'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ArrowRightLeft, Calendar, Building2, Package, History as HistoryIcon, ArrowDownToLine, ArrowUpFromLine, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface Movement {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
  productName: string | null;
  productSku: string | null;
  warehouseName: string | null;
  userName: string | null;
}

interface Summary {
  totalIn: number;
  totalOut: number;
  netChange: number;
}

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIn: 0, totalOut: 0, netChange: 0 });
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<{id: string, name: string}[]>([]);
  const [products, setProducts] = useState<{id: string, name: string}[]>([]);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  const [filters, setFilters] = useState({
    warehouseId: 'all',
    productId: 'all',
    type: 'all',
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const loadDependencies = async () => {
    try {
      const [whRes, prRes] = await Promise.all([
        fetch('/api/v1/warehouses').then(r => r.json()),
        fetch('/api/v1/products?limit=1000').then(r => r.json()) // get mostly all for filter
      ]);
      if (whRes.success) setWarehouses(whRes.data);
      if (prRes.success) setProducts(prRes.data.items || []);
    } catch (err) {
      console.error('Error loading filters dependencies', err);
    }
  };

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        warehouseId: filters.warehouseId,
        productId: filters.productId,
        type: filters.type,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const res = await fetch(`/api/v1/inventory/movements?${query.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setMovements(data.data.items);
        setTotalPages(data.data.totalPages);
        setTotalItems(data.data.total);
        setSummary(data.data.summary);
      } else {
        toast.error('Error al cargar movimientos', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    loadDependencies();
  }, []);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const getMovementTypeBadge = (type: string) => {
    switch(type) {
      case 'sale': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">Venta</span>;
      case 'purchase': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">Compra</span>;
      case 'transfer_in': return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">Entrada TR.</span>;
      case 'transfer_out': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">Salida TR.</span>;
      case 'adjustment': return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">Ajuste</span>;
      default: return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">{type}</span>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold flex items-center gap-3">
            <HistoryIcon className="h-8 w-8 text-primary" /> Historial de Movimientos
          </h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">
            Auditoría de entradas, salidas y traslados de inventario por almacén.
          </p>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm p-6 rounded-3xl flex items-center gap-4">
          <div className="bg-green-100 p-4 rounded-2xl text-green-600">
            <ArrowDownToLine className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">Total Entradas</p>
            <h3 className="text-2xl font-black text-green-700 mt-1">+{summary.totalIn.toLocaleString()}</h3>
          </div>
        </div>
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm p-6 rounded-3xl flex items-center gap-4">
          <div className="bg-red-100 p-4 rounded-2xl text-red-600">
            <ArrowUpFromLine className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">Total Salidas</p>
            <h3 className="text-2xl font-black text-red-700 mt-1">{summary.totalOut.toLocaleString()}</h3>
          </div>
        </div>
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm p-6 rounded-3xl flex items-center gap-4">
          <div className="bg-primary/10 p-4 rounded-2xl text-primary">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">Variación Neta</p>
            <h3 className={`text-2xl font-black mt-1 ${summary.netChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {summary.netChange >= 0 ? '+' : ''}{summary.netChange.toLocaleString()}
            </h3>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-primary" />
          <h4 className="font-bold text-primary text-sm uppercase tracking-wider">Filtros Avanzados</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-1.5 flex items-center gap-1"><Building2 className="h-3 w-3" /> Almacén</label>
            <select
              value={filters.warehouseId}
              onChange={e => { setFilters({...filters, warehouseId: e.target.value}); setPage(1); }}
              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Todos los almacenes</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-1.5 flex items-center gap-1"><Package className="h-3 w-3" /> Producto</label>
            <select
              value={filters.productId}
              onChange={e => { setFilters({...filters, productId: e.target.value}); setPage(1); }}
              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Todos los productos</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-1.5 flex items-center gap-1"><ArrowRightLeft className="h-3 w-3" /> Tipo</label>
            <select
              value={filters.type}
              onChange={e => { setFilters({...filters, type: e.target.value}); setPage(1); }}
              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Todos los tipos</option>
              <option value="sale">Ventas</option>
              <option value="purchase">Compras</option>
              <option value="transfer_in">Entrada (Traslado)</option>
              <option value="transfer_out">Salida (Traslado)</option>
              <option value="adjustment">Ajustes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-1.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Desde</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => { setFilters({...filters, startDate: e.target.value}); setPage(1); }}
              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-1.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Hasta</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => { setFilters({...filters, endDate: e.target.value}); setPage(1); }}
              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl overflow-hidden relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10">
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Fecha / Hora</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Producto</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Almacén</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Tipo</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold text-right">Cantidad</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold text-right">Balance</th>
                <th className="px-6 py-4 font-label-md text-on-surface-variant/70 uppercase tracking-[0.1em] text-[10px] font-bold">Usuario / Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {movements.length > 0 ? (
                movements.map((mov) => {
                  const qty = parseFloat(mov.quantity);
                  const isPositive = qty > 0;
                  return (
                    <tr key={mov.id} className="hover:bg-primary/5 transition-all">
                      <td className="px-6 py-4 font-body-sm">
                        <div className="font-bold text-primary">{new Date(mov.createdAt).toLocaleDateString('es-DO')}</div>
                        <div className="text-[10px] text-on-surface-variant font-mono-data opacity-70 mt-0.5">{new Date(mov.createdAt).toLocaleTimeString('es-DO')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-primary text-sm max-w-[200px] truncate" title={mov.productName || ''}>{mov.productName}</p>
                        <p className="text-[10px] text-on-surface-variant/70 font-mono-data">SKU: {mov.productSku}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-sm bg-surface-container px-2 py-1 rounded-md">{mov.warehouseName}</span>
                      </td>
                      <td className="px-6 py-4">
                        {getMovementTypeBadge(mov.type)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-mono-data font-black text-sm px-2 py-1 rounded-lg ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {isPositive ? '+' : ''}{qty}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono-data font-bold text-on-surface">{parseFloat(mov.balanceAfter)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-on-surface-variant">{mov.userName}</p>
                        {mov.description && (
                          <p className="text-[10px] text-on-surface-variant/60 max-w-[200px] truncate" title={mov.description}>{mov.description}</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                    No se encontraron movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/10 flex justify-between items-center">
          <span className="text-xs font-bold text-on-surface-variant/70">
            Total Resultados: <span className="text-primary">{totalItems}</span>
          </span>
          <div className="flex gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 border border-outline-variant/30 rounded-xl hover:bg-white text-xs font-bold disabled:opacity-50 transition-all"
            >
              Anterior
            </button>
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold">
              Página {page} de {Math.max(1, totalPages)}
            </span>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 border border-outline-variant/30 rounded-xl hover:bg-white text-xs font-bold disabled:opacity-50 transition-all"
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
