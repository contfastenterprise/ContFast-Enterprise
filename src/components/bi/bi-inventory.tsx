'use client';

import React, { useState } from 'react';
import { 
  ArrowUpRight, ArrowDownLeft, ShieldAlert, 
  Layers, Package, Building2, TrendingUp 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Cell, Legend
} from 'recharts';

interface BIInventoryProps {
  data: any;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function BIInventory({ data }: BIInventoryProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'exhausted' | 'critical' | 'excessive'>('all');

  if (!data) return null;

  const flows = data.flows || {};
  const stockLevels = data.stockLevels || [];
  const categoryRotations = data.categoryRotations || [];
  const warehouseRotations = data.warehouseRotations || [];

  // Filter stock levels
  const filteredLevels = stockLevels.filter((lvl: any) => {
    if (filterStatus === 'all') return true;
    return lvl.status === filterStatus;
  });

  // Prepare chart data for Inventory Flows (Inputs vs Outputs)
  const flowChartData = [
    { name: 'Entradas (Compras)', cantidad: flows.purchases || 0, type: 'in' },
    { name: 'Entradas (Traslados)', cantidad: flows.transfersIn || 0, type: 'in' },
    { name: 'Entradas (Ajustes)', cantidad: flows.adjustments > 0 ? flows.adjustments : 0, type: 'in' },
    { name: 'Salidas (Ventas)', cantidad: flows.sales || 0, type: 'out' },
    { name: 'Salidas (Traslados)', cantidad: flows.transfersOut || 0, type: 'out' },
    { name: 'Salidas (Devoluciones)', cantidad: flows.refunds || 0, type: 'out' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* ─── FLOW & CHARTS SECTION ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Inventory Flow Bar Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-1">Flujo Físico de Mercancías</h4>
          <p className="text-xs text-on-surface-variant mb-6">Comparativa de unidades ingresadas vs retiradas del inventario</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <RechartsTooltip />
                <Bar dataKey="cantidad" barSize={30} radius={[4, 4, 0, 0]}>
                  {flowChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.type === 'in' ? '#008080' : '#ef4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Warehouse Stock value bar chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-on-surface text-base mb-1">Valor de Inventario por Almacén</h4>
            <p className="text-xs text-on-surface-variant mb-6">Costo acumulado de existencias en cada sucursal/almacén</p>
          </div>
          <div className="h-80">
            {warehouseRotations.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={warehouseRotations} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
                  <RechartsTooltip formatter={(value: any) => [fmtDop(Number(value))]} />
                  <Bar dataKey="stockValue" name="Valor Stock (Costo)" fill="#003366" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-on-surface-variant/40">Sin datos de existencias por almacén</div>
            )}
          </div>
        </div>

      </div>

      {/* ─── ROTATION SECTION ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Rotation by category */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-4">Índice de Rotación por Categoría</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Categoría</th>
                  <th className="px-4 py-3 text-right">Costo Ventas (COGS)</th>
                  <th className="px-4 py-3 text-right">Valor Promedio Stock</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Índice Rotación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {categoryRotations.map((c: any) => (
                  <tr key={c.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-on-surface">{c.name || 'Sin Categoría'}</td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant">{fmtDop(c.salesCost)}</td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant">{fmtDop(c.stockValue)}</td>
                    <td className="px-4 py-3.5 text-right font-black text-primary">
                      {c.rotation.toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rotation by warehouse */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-4">Índice de Rotación por Almacén</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Almacén</th>
                  <th className="px-4 py-3 text-right">Costo Ventas (COGS)</th>
                  <th className="px-4 py-3 text-right">Valor Promedio Stock</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Índice Rotación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {warehouseRotations.map((w: any) => (
                  <tr key={w.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-on-surface">{w.name}</td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant">{fmtDop(w.salesCost)}</td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant">{fmtDop(w.stockValue)}</td>
                    <td className="px-4 py-3.5 text-right font-black text-primary">
                      {w.rotation.toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ─── STOCK LEVELS LIST SECTION ─── */}
      <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h4 className="font-bold text-on-surface text-base">Existencias y Umbrales</h4>
            <p className="text-xs text-on-surface-variant">Listado detallado de existencias físicas y umbrales de reordenamiento</p>
          </div>
          
          {/* Status filter buttons */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterStatus === 'all' ? 'bg-primary text-white' : 'bg-surface-variant/40 text-on-surface-variant'}`}
            >
              Todos ({stockLevels.length})
            </button>
            <button 
              onClick={() => setFilterStatus('exhausted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterStatus === 'exhausted' ? 'bg-[#ff4d4d] text-white' : 'bg-red-50 text-[#ff4d4d]'}`}
            >
              Agotado ({stockLevels.filter((l: any) => l.status === 'exhausted').length})
            </button>
            <button 
              onClick={() => setFilterStatus('critical')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterStatus === 'critical' ? 'bg-[#ff9900] text-white' : 'bg-amber-50 text-[#ff9900]'}`}
            >
              Bajo Mínimo ({stockLevels.filter((l: any) => l.status === 'critical').length})
            </button>
            <button 
              onClick={() => setFilterStatus('excessive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterStatus === 'excessive' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600'}`}
            >
              Exceso ({stockLevels.filter((l: any) => l.status === 'excessive').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Almacén</th>
                <th className="px-4 py-3 text-right">Existencias</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Costo Unitario</th>
                <th className="px-4 py-3 rounded-r-lg">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredLevels.map((lvl: any, idx: number) => {
                let badgeColor = 'bg-surface-variant text-on-surface-variant';
                let badgeLabel = 'NORMAL';

                if (lvl.status === 'exhausted') {
                  badgeColor = 'bg-red-100 text-red-800';
                  badgeLabel = 'AGOTADO';
                } else if (lvl.status === 'critical') {
                  badgeColor = 'bg-amber-100 text-amber-800';
                  badgeLabel = 'BAJO MÍNIMO';
                } else if (lvl.status === 'excessive') {
                  badgeColor = 'bg-blue-100 text-blue-800';
                  badgeLabel = 'SOBRE STOCK';
                }

                return (
                  <tr key={`${lvl.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{lvl.sku || 'N/A'}</td>
                    <td className="px-4 py-3 font-bold text-on-surface">{lvl.name}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{lvl.warehouse}</td>
                    <td className="px-4 py-3 text-right font-semibold text-on-surface">
                      {lvl.stock.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant/60">
                      {lvl.minStock.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant">
                      {fmtDop(lvl.cost)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredLevels.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-on-surface-variant">No se encontraron productos con el filtro de estatus seleccionado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
