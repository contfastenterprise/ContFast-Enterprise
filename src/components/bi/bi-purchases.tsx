'use client';

import React from 'react';
import { 
  ShoppingCart, Building2, TrendingDown, Clock, 
  CheckCircle, ArrowUpRight, DollarSign, Wallet 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Cell, PieChart, Pie, Legend
} from 'recharts';

interface BIPurchasesProps {
  data: any;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function BIPurchases({ data }: BIPurchasesProps) {
  if (!data) return null;

  const suppliers = data.suppliers || [];
  const topProducts = data.topProducts || [];
  const monthlyHistory = data.monthlyHistory || [];
  const apStatus = data.apStatus || { total: 0, pending: 0, paid: 0 };

  // AP data for Pie Chart
  const apChartData = [
    { name: 'Pagado', value: apStatus.paid, color: '#008080' },
    { name: 'Pendiente', value: apStatus.pending, color: '#ef4444' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* ─── AP STATUS SECTION ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Total Accounts Payable */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-surface-variant/30 text-on-surface-variant rounded-2xl shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Cuentas por Pagar Totales</p>
            <h3 className="text-xl md:text-2xl font-black text-on-surface mt-1">
              {fmtDop(apStatus.total)}
            </h3>
          </div>
        </div>

        {/* Paid AP */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-green-50 text-green-600 rounded-2xl shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Monto Liquidado</p>
            <h3 className="text-xl md:text-2xl font-black text-green-600 mt-1">
              {fmtDop(apStatus.paid)}
            </h3>
          </div>
        </div>

        {/* Pending AP */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-red-50 text-red-500 rounded-2xl shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Monto Pendiente (Deuda)</p>
            <h3 className="text-xl md:text-2xl font-black text-red-500 mt-1">
              {fmtDop(apStatus.pending)}
            </h3>
          </div>
        </div>

      </div>

      {/* ─── CHARTS & TOP SUPPLIERS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Top Suppliers Spenders Table */}
        <div className="lg:col-span-2 bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-4">Top Proveedores (Compras Registradas)</h4>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Proveedor</th>
                  <th className="px-4 py-3 text-right">Facturas Gasto</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Monto Facturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {suppliers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-on-surface">
                      {s.name}
                      <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">RNC: {s.rnc}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant font-medium">
                      {s.count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-[#800020]">
                      {fmtDop(s.amount)}
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-on-surface-variant">Sin compras registradas a proveedores</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CxP Liquidation Share Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-on-surface text-base mb-2">Liquidez de Cuentas por Pagar</h4>
            <p className="text-xs text-on-surface-variant mb-4">Relación entre gastos saldados vs saldos adeudados</p>
          </div>
          <div className="h-64 flex justify-center items-center">
            {apStatus.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={apChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {apChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: any) => [fmtDop(Number(value))]} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-on-surface-variant text-sm">Sin saldos de cuentas por pagar</div>
            )}
          </div>
        </div>

      </div>

      {/* ─── TOP PURCHASED PRODUCTS ─── */}
      <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
        <h4 className="font-bold text-on-surface text-base mb-4">Artículos de Mayor Compra / Costos Promedios</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad Adquirida</th>
                <th className="px-4 py-3 text-right">Costo Promedio Compra</th>
                <th className="px-4 py-3 text-right rounded-r-lg">Monto Total Invertido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {topProducts.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-on-surface">
                    {p.name}
                    <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">SKU: {p.sku || 'Sin SKU'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-on-surface">
                    {p.quantity.toLocaleString('es-DO')}
                  </td>
                  <td className="px-4 py-3.5 text-right text-on-surface-variant font-medium">
                    {fmtDop(p.avgCost)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-rose-500">
                    {fmtDop(p.amount)}
                  </td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-on-surface-variant">Sin registros de artículos comprados en el período</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
