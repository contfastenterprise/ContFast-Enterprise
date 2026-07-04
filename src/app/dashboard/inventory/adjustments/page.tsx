'use client';

import { useState, useEffect } from 'react';
import { Save, PackageMinus, Settings2, RefreshCw, Scale, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { SearchBar } from '@/components/ui/search-bar';

interface Product { id: string; name: string; sku: string; }
interface Warehouse { id: string; name: string; }

export default function InventoryAdjustmentsPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentQty, setCurrentQty] = useState<number | null>(null);
  
  const [newQuantity, setNewQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // Table states
  const [tableProducts, setTableProducts] = useState<Product[]>([]);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [tableTotalPages, setTableTotalPages] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableInventory, setTableInventory] = useState<Record<string, number>>({});
  const [tableInputs, setTableInputs] = useState<Record<string, string>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/v1/warehouses').then(r => r.json()).then(data => {
      if (data.data && data.data.length > 0) {
        setWarehouses(data.data);
        setWarehouseId(data.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setSearching(true);
        fetch(`/api/v1/products?search=${searchQuery}&limit=10`)
          .then(r => r.json())
          .then(data => {
            if (data.success) setProducts(data.data.items || data.data || []);
          })
          .finally(() => setSearching(false));
      } else {
        setProducts([]);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedProduct && warehouseId) {
      // Obtener inventario actual
      fetch(`/api/v1/products/${selectedProduct.id}/inventory`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            const wh = data.data.find((w: any) => w.warehouseId === warehouseId || w.warehouseName === warehouses.find(ww => ww.id === warehouseId)?.name);
            setCurrentQty(wh ? parseFloat(wh.quantity) : 0);
          }
        });
    } else {
      setCurrentQty(null);
    }
  }, [selectedProduct, warehouseId, warehouses]);

  // Load products for the bottom table
  useEffect(() => {
    let active = true;
    setTableLoading(true);
    fetch(`/api/v1/products?per_page=10&page=${tablePage}&search=${encodeURIComponent(tableSearchQuery)}`)
      .then(r => r.json())
      .then(data => {
        if (active && data.success) {
          const items = data.data || [];
          setTableProducts(items);
          setTableTotalPages(data.meta?.total_pages || 1);
        }
      })
      .catch(err => {
        console.error(err);
        toast.error('Error al cargar productos para la tabla');
      })
      .finally(() => {
        if (active) setTableLoading(false);
      });
    return () => { active = false; };
  }, [tablePage, tableSearchQuery]);

  // Fetch inventory levels for the table products when warehouseId or tableProducts change
  useEffect(() => {
    if (tableProducts.length === 0 || !warehouseId) {
      setTableInventory({});
      return;
    }

    const fetchAllInventory = async () => {
      const invMap: Record<string, number> = {};
      try {
        await Promise.all(
          tableProducts.map(async (p) => {
            const res = await fetch(`/api/v1/products/${p.id}/inventory`);
            const data = await res.json();
            if (data.success) {
              const wh = data.data.find(
                (w: any) =>
                  w.warehouseId === warehouseId ||
                  w.warehouseName === warehouses.find((ww) => ww.id === warehouseId)?.name
              );
              invMap[p.id] = wh ? parseFloat(wh.quantity) : 0;
            } else {
              invMap[p.id] = 0;
            }
          })
        );
        setTableInventory(invMap);
      } catch (err) {
        console.error('Error fetching table inventories:', err);
      }
    };

    fetchAllInventory();
  }, [tableProducts, warehouseId, warehouses]);

  const handleAdjust = async () => {
    if (!warehouseId || !selectedProduct) return toast.error('Selecciona almacén y producto');
    if (newQuantity === '') return toast.error('Ingresa la nueva cantidad');
    if (!reason) return toast.error('Ingresa un motivo (Ej. Conteo Físico)');

    setLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          productId: selectedProduct.id,
          newQuantity: parseFloat(newQuantity),
          reason
        })
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Ajuste guardado exitosamente');
        setSelectedProduct(null);
        setSearchQuery('');
        setNewQuantity('');
        setReason('');
      } else {
        toast.error('Error', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTableAdjust = async (productId: string) => {
    const newQtyStr = tableInputs[productId];
    if (newQtyStr === undefined || newQtyStr === '') {
      return toast.error('Ingresa la nueva cantidad');
    }
    const newQty = parseFloat(newQtyStr);
    if (isNaN(newQty) || newQty < 0) {
      return toast.error('Ingresa una cantidad válida');
    }

    const currentVal = tableInventory[productId] ?? 0;
    if (newQty === currentVal) {
      return toast.info('La cantidad ingresada es igual al stock actual');
    }

    setRowLoading(prev => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          productId,
          newQuantity: newQty,
          reason: 'Conteo físico (Ajuste rápido desde tabla)'
        })
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Ajuste guardado exitosamente');
        setTableInventory(prev => ({ ...prev, [productId]: newQty }));
        setTableInputs(prev => ({ ...prev, [productId]: '' }));
        
        if (selectedProduct && selectedProduct.id === productId) {
          setCurrentQty(newQty);
        }
      } else {
        toast.error('Error', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setRowLoading(prev => ({ ...prev, [productId]: false }));
    }
  };

  const diff = currentQty !== null && newQuantity !== '' ? parseFloat(newQuantity) - currentQty : null;

  return (
    <div className="space-y-8 animate-fade-in-up pb-10 max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold flex items-center gap-3">
            <Scale className="h-8 w-8 text-primary" /> Ajustes de Inventario
          </h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">Sincroniza el sistema con el inventario físico real.</p>
        </div>
      </header>

      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6 md:p-10">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-2 uppercase tracking-wider">1. Almacén Destino</label>
            <select 
              value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
              className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            >
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 mb-2 uppercase tracking-wider">2. Buscar Producto</label>
            <div className="relative">
              <SearchBar
                placeholder="Escribe el nombre o SKU..."
                value={searchQuery}
                onChange={(val) => {
                  setSearchQuery(val);
                  setSelectedProduct(null);
                }}
              />
              {searching && <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />}
              
              {products.length > 0 && !selectedProduct && (
                <div className="mt-2 bg-white border border-outline/20 rounded-xl shadow-xl max-h-60 overflow-y-auto absolute z-[50] w-full left-0">
                  {products.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      className="w-full text-left px-4 py-3 border-b border-outline/10 hover:bg-surface-container text-sm flex justify-between items-center transition-colors"
                    >
                      <span className="font-bold text-primary">{p.name}</span>
                      <span className="text-xs text-on-surface-variant font-mono bg-surface-container-high px-2 py-1 rounded">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedProduct && (
          <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-xl text-primary">{selectedProduct.name}</h3>
                <p className="text-sm font-mono text-on-surface-variant">SKU: {selectedProduct.sku}</p>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                Cambiar Producto
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-outline-variant/20">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-1">Stock Actual (Sistema)</label>
                <div className="text-2xl font-mono font-bold text-on-surface-variant">
                  {currentQty === null ? '...' : currentQty.toFixed(2)}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-primary mb-1">Nueva Cantidad Física</label>
                <input 
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={newQuantity} onChange={e => setNewQuantity(e.target.value)}
                  className="w-full bg-white border border-primary/30 rounded-xl px-4 py-3 text-xl font-mono font-bold text-primary focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-1">Diferencia de Ajuste</label>
                <div className={`text-2xl font-mono font-bold ${diff !== null && diff > 0 ? 'text-emerald-500' : diff !== null && diff < 0 ? 'text-red-500' : 'text-on-surface-variant'}`}>
                  {diff !== null ? (diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)) : '0.00'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant/70 mb-2 uppercase tracking-wider">Motivo del Ajuste</label>
              <input 
                type="text" placeholder="Ej. Conteo físico, Mercancía dañada, Mermas..."
                value={reason} onChange={e => setReason(e.target.value)}
                className="w-full bg-white border border-outline/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleAdjust}
                disabled={loading || diff === 0 || diff === null || !reason}
                className="bg-primary text-on-primary px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span className="font-label-md text-sm font-bold">Aplicar Ajuste</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla de Productos Disponibles */}
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6 md:p-10 mt-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="font-bold text-xl text-primary">Productos Disponibles</h2>
            <p className="text-sm text-on-surface-variant/85 mt-1">
              Establece directamente la cantidad total física en el almacén seleccionado.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/50" />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={tableSearchQuery}
              onChange={e => {
                setTableSearchQuery(e.target.value);
                setTablePage(1);
              }}
              className="w-full bg-surface-container-high border-none rounded-xl pl-11 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {tableLoading ? (
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : tableProducts.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant/70 text-sm">
            No se encontraron productos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 text-xs font-bold uppercase tracking-wider text-on-surface-variant/70">
                  <th className="pb-3 pl-4">Producto</th>
                  <th className="pb-3">SKU</th>
                  <th className="pb-3 text-right">Stock Actual</th>
                  <th className="pb-3 text-center" style={{ width: '180px' }}>Nueva Cantidad Total</th>
                  <th className="pb-3 text-right">Diferencia</th>
                  <th className="pb-3 pr-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {tableProducts.map(p => {
                  const currentStock = tableInventory[p.id];
                  const inputVal = tableInputs[p.id] ?? '';
                  const newQty = inputVal !== '' ? parseFloat(inputVal) : NaN;
                  const diffVal = !isNaN(newQty) && currentStock !== undefined ? newQty - currentStock : null;
                  const isRowLoading = rowLoading[p.id] || false;

                  return (
                    <tr key={p.id} className="hover:bg-surface-container-lowest/40 transition-colors text-sm">
                      <td className="py-4 pl-4 font-bold text-primary max-w-[200px] truncate">{p.name}</td>
                      <td className="py-4 font-mono text-xs text-on-surface-variant">{p.sku}</td>
                      <td className="py-4 text-right font-mono font-bold text-on-surface-variant">
                        {currentStock === undefined ? '...' : currentStock.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={inputVal}
                          onChange={e => setTableInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full text-center bg-surface-container-high border border-outline/10 rounded-lg px-2 py-1.5 text-sm font-mono font-bold text-primary focus:ring-2 focus:ring-primary outline-none"
                          disabled={isRowLoading}
                        />
                      </td>
                      <td className={`py-4 text-right font-mono font-bold ${diffVal !== null && diffVal > 0 ? 'text-emerald-500' : diffVal !== null && diffVal < 0 ? 'text-red-500' : 'text-on-surface-variant/60'}`}>
                        {diffVal !== null ? (diffVal > 0 ? `+${diffVal.toFixed(2)}` : diffVal.toFixed(2)) : '0.00'}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <button
                          onClick={() => handleTableAdjust(p.id)}
                          disabled={isRowLoading || inputVal === '' || isNaN(newQty) || newQty === currentStock}
                          className="bg-primary text-on-primary hover:shadow-md hover:shadow-primary/20 p-2 rounded-lg inline-flex items-center justify-center transition-all disabled:opacity-40"
                          title="Establecer cantidad"
                        >
                          {isRowLoading ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Controles de paginación */}
            {tableTotalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-outline-variant/20">
                <span className="text-xs text-on-surface-variant">
                  Página {tablePage} de {tableTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTablePage(p => Math.max(p - 1, 1))}
                    disabled={tablePage === 1}
                    className="p-1.5 rounded-lg bg-surface-container-high text-primary hover:bg-surface-container transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setTablePage(p => Math.min(p + 1, tableTotalPages))}
                    disabled={tablePage === tableTotalPages}
                    className="p-1.5 rounded-lg bg-surface-container-high text-primary hover:bg-surface-container transition-colors disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
