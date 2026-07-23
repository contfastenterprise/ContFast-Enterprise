'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { Package, RefreshCw, AlertTriangle, ArrowRight, ShoppingCart, DollarSign, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface ReorderSuggestion {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  unitOfMeasure: string;
  cost: string;
  warehouseId: string;
  warehouseName: string;
  quantity: string;
  minStock: string;
  maxStock: string | null;
  reorderQuantity: number;
}

export default function ReorderSuggestionsPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/reorder-suggestions');
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data || []);
      } else {
        toast.error(data.error || 'Error al cargar sugerencias');
      }
    } catch (e) {
      console.error('Error loading reorder suggestions:', e);
      toast.error('Error de red al obtener reordenes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleGeneratePurchase = (item: ReorderSuggestion) => {
    toast.info(`Redirigiendo a compras para reordenar ${item.productName}`);
    router.push(`/dashboard/purchases?reorderProductId=${item.productId}&reorderQty=${item.reorderQuantity}&reorderWarehouseId=${item.warehouseId}`);
  };

  // KPIs
  const totalItems = suggestions.length;
  const criticalItems = suggestions.filter(s => Number(s.quantity) <= Number(s.minStock) * 0.2).length;
  const totalEstimatedCost = suggestions.reduce((acc, s) => acc + (s.reorderQuantity * Number(s.cost || 0)), 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
            Sugerencias de Reorden WMS
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Listado de productos con inventario por debajo del stock mínimo. Planea tus compras de reabastecimiento eficientemente.
          </p>
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Productos por Reordenar</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalItems}</h3>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Productos Críticos</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{criticalItems}</h3>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inversión Estimada</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">
              {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(totalEstimatedCost)}
            </h3>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#C5A059]" />
          <h3 className="font-bold text-[#003366]">Artículos en Alerta de Stock</h3>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              ¡Excelente! No hay productos con stock crítico o por debajo del mínimo configurado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold text-slate-400 uppercase">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4">Almacén</th>
                    <th className="py-3 px-4 text-right">Existencia Actual</th>
                    <th className="py-3 px-4 text-right">Stock Mínimo</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Sugerencia Compra</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {suggestions.map((item) => {
                    const qty = Number(item.quantity);
                    const min = Number(item.minStock);
                    const isCritical = qty <= min * 0.2;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-bold text-slate-800">{item.productName}</p>
                            {item.sku && <p className="text-xs text-slate-400 font-mono">SKU: {item.sku}</p>}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-600 font-medium">{item.warehouseName}</td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-slate-700">
                          {qty.toFixed(2)} <span className="text-[10px] text-slate-400 uppercase">{item.unitOfMeasure}</span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-slate-500">
                          {min.toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${isCritical
                              ? 'bg-rose-50 text-rose-700 border border-rose-100 animate-pulse'
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`} />
                            {isCritical ? 'Crítico' : 'Bajo Stock'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-[#003366]">
                          +{item.reorderQuantity} <span className="text-[10px] text-slate-400 uppercase">{item.unitOfMeasure}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => handleGeneratePurchase(item)}
                            className="bg-[#003366] hover:bg-[#002244] text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ml-auto cursor-pointer"
                          >
                            Generar Compra <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
