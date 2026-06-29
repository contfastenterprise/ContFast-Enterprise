'use client';

import React, { useState } from 'react';
import { 
  TrendingUp, ArrowDown, Package, HelpCircle, 
  RefreshCw, CheckCircle, Percent, AlertCircle 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Cell, PieChart, Pie, Legend
} from 'recharts';

interface BIProductsProps {
  data: any;
  onNavigateToProduct?: (productId: string) => void;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function BIProducts({ data, onNavigateToProduct }: BIProductsProps) {
  const [subTab, setSubTab] = useState<'sales' | 'profit' | 'slow' | 'returns'>('sales');

  if (!data) return null;

  const top10 = data.top10 || [];
  const bottom10 = data.bottom10 || [];
  const highestProfit = data.highestProfit || [];
  const noMovement = data.noMovement || [];
  const returns = data.returns || [];

  // Group by category for donut chart
  const categoryTotals: Record<string, number> = {};
  top10.forEach((p: any) => {
    categoryTotals[p.category] = (categoryTotals[p.category] || 0) + p.revenue;
  });
  const categoryData = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

  const COLORS = ['#003366', '#008080', '#D4AF37', '#800020', '#36454F', '#4B0082', '#FF4500'];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* Tab Navigation */}
      <div className="flex border-b border-outline-variant/30">
        <button
          onClick={() => setSubTab('sales')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'sales' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Top Ventas (Volumen)
        </button>
        <button
          onClick={() => setSubTab('profit')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'profit' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Rentabilidad y Margen
        </button>
        <button
          onClick={() => setSubTab('slow')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'slow' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Sin Movimiento / Lento
        </button>
        <button
          onClick={() => setSubTab('returns')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'returns' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Devoluciones
        </button>
      </div>

      {/* ─── TAB CONTENT: SALES ─── */}
      {subTab === 'sales' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Table Top 10 */}
          <div className="lg:col-span-2 bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
            <h4 className="font-bold text-on-surface text-base mb-4">Top 10 Productos Más Vendidos</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Producto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Cant. Vendida</th>
                    <th className="px-4 py-3 text-right rounded-r-lg">Total Facturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {top10.map((p: any) => (
                    <tr 
                      key={p.id} 
                      onClick={() => onNavigateToProduct?.(p.id)}
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 font-bold text-on-surface">
                        <span className="block truncate max-w-[200px]" title={p.name}>{p.name}</span>
                        <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">{p.sku || 'Sin SKU'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-on-surface-variant">{p.category}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-on-surface">
                        {p.quantity.toLocaleString('es-DO')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-primary">
                        {fmtDop(p.revenue)}
                      </td>
                    </tr>
                  ))}
                  {top10.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-on-surface-variant">Sin movimientos de ventas registrados en el rango</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Share Donut Chart */}
          <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-on-surface text-base mb-1">Ventas por Categoría</h4>
              <p className="text-xs text-on-surface-variant mb-4">Contribución de facturación de los productos top</p>
            </div>
            <div className="h-64 flex justify-center items-center">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: any) => [fmtDop(Number(value))]} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-on-surface-variant text-sm">Sin datos de categorías</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: PROFITABILITY ─── */}
      {subTab === 'profit' && (
        <div className="grid grid-cols-1 gap-8">
          <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
            <h4 className="font-bold text-on-surface text-base mb-4">Análisis de Utilidad y Margen</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Producto</th>
                    <th className="px-4 py-3 text-right">Facturación</th>
                    <th className="px-4 py-3 text-right">Utilidad Bruta</th>
                    <th className="px-4 py-3 text-center">Margen Bruto</th>
                    <th className="px-4 py-3 rounded-r-lg">Estatus Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {highestProfit.map((p: any) => {
                    const margin = p.margin;
                    let badgeColor = 'bg-green-100 text-green-800';
                    let label = 'Alto (>= 40%)';
                    if (margin < 15) {
                      badgeColor = 'bg-red-100 text-red-800';
                      label = 'Crítico (< 15%)';
                    } else if (margin < 30) {
                      badgeColor = 'bg-amber-100 text-amber-800';
                      label = 'Moderado (15-30%)';
                    } else if (margin < 40) {
                      badgeColor = 'bg-blue-100 text-blue-800';
                      label = 'Saludable (30-40%)';
                    }

                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => onNavigateToProduct?.(p.id)}
                        className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3.5 font-bold text-on-surface">
                          {p.name}
                          <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">{p.sku}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-on-surface-variant">{fmtDop(p.revenue)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-green-600">{fmtDop(p.profit)}</td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-bold text-on-surface">{margin.toFixed(1)}%</span>
                            <div className="w-16 bg-surface-variant rounded-full h-1.5 overflow-hidden hidden sm:block">
                              <div 
                                className={`h-full ${margin < 15 ? 'bg-red-500' : margin < 30 ? 'bg-amber-500' : 'bg-green-500'}`} 
                                style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} 
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${badgeColor}`}>
                            {label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {highestProfit.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-on-surface-variant">Sin datos de utilidad calculables</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: SLOW MOVEMENT ─── */}
      {subTab === 'slow' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Unsold Products list */}
          <div className="lg:col-span-2 bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="font-bold text-on-surface text-base">Productos Sin Movimiento</h4>
                <p className="text-xs text-on-surface-variant">Catálogo activo sin facturas emitidas en el período</p>
              </div>
              <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold">
                {noMovement.length} Productos inactivos
              </span>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-3">Código SKU</th>
                    <th className="px-4 py-3">Nombre del Producto</th>
                    <th className="px-4 py-3 text-right">Costo Base</th>
                    <th className="px-4 py-3 text-right">Precio Venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {noMovement.slice(0, 30).map((p: any) => (
                    <tr 
                      key={p.id} 
                      onClick={() => onNavigateToProduct?.(p.id)}
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{p.sku}</td>
                      <td className="px-4 py-3 font-bold text-on-surface">{p.name}</td>
                      <td className="px-4 py-3 text-right text-on-surface-variant">{fmtDop(p.cost)}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{fmtDop(p.price)}</td>
                    </tr>
                  ))}
                  {noMovement.length > 30 && (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-xs text-on-surface-variant">
                        Mostrando los primeros 30 productos. Filtre por categoría para acotar el análisis.
                      </td>
                    </tr>
                  )}
                  {noMovement.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-on-surface-variant">Todos los productos activos han tenido movimiento</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Explanation panel */}
          <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 text-amber-500 rounded-xl w-fit">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-on-surface text-base">Riesgo de Inventario Inmovilizado</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Tener productos sin movimiento genera **costo de oportunidad** y reduce la liquidez de la empresa.
              </p>
              <div className="bg-surface-variant/30 p-4 rounded-2xl space-y-2">
                <p className="text-xs font-bold text-on-surface">Recomendaciones BI:</p>
                <ul className="text-xs text-on-surface-variant space-y-1.5 list-disc list-inside">
                  <li>Lanzar promociones o packs promocionales.</li>
                  <li>Revisar si los precios están fuera de mercado.</li>
                  <li>Evaluar devoluciones a proveedores si aplica.</li>
                  <li>Ajustar futuras órdenes de compra.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: RETURNS ─── */}
      {subTab === 'returns' && (
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-4">Productos Con Más Devoluciones (Notas de Crédito / Reembolsos)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Código SKU</th>
                  <th className="px-4 py-3">Nombre del Producto</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Cantidad Devuelta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {returns.map((r: any) => (
                  <tr 
                    key={r.id} 
                    onClick={() => onNavigateToProduct?.(r.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-on-surface-variant">{r.sku || 'N/A'}</td>
                    <td className="px-4 py-3.5 font-bold text-on-surface">{r.name}</td>
                    <td className="px-4 py-3.5 text-right font-black text-rose-500">{r.quantity.toLocaleString('es-DO')}</td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-on-surface-variant">No se han registrado devoluciones físicas de inventario en este período</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
