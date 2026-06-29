'use client';

import React from 'react';
import { 
  TrendingUp, DollarSign, ShoppingCart, 
  Package, Activity, ArrowUpRight 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell
} from 'recharts';
import { BorderRotate } from '@/components/ui/animated-gradient-border';

interface BIGeneralProps {
  generalData: any;
  billingData: any;
  purchasesData: any;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

const fmtCompact = (val: number) => {
  if (val >= 1_000_000) return `RD$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `RD$ ${(val / 1_000).toFixed(0)}K`;
  return `RD$ ${val.toFixed(0)}`;
};

export default function BIGeneral({ generalData, billingData, purchasesData }: BIGeneralProps) {
  if (!generalData || !billingData || !purchasesData) return null;

  // Process data for Ventas vs Compras comparison chart (last 6 months)
  const billingHistory = billingData.monthlyHistory || [];
  const purchasesHistory = purchasesData.monthlyHistory || [];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const comparisonData = billingHistory.slice(-6).map((b: any) => {
    const pMatch = purchasesHistory.find((p: any) => p.year === b.year && p.month === b.month);
    return {
      name: `${monthNames[b.month - 1]} ${b.year}`,
      Ventas: b.amount,
      Compras: pMatch ? pMatch.amount : 0
    };
  });

  // Seller Performance Chart Data
  const sellersData = (billingData.sellers || []).slice(0, 5).map((s: any) => ({
    name: s.name,
    Ventas: s.amount
  }));

  // Weekly Sales Distribution Data
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const weeklyData = daysOfWeek.map((dayName, idx) => {
    const match = (billingData.weekly || []).find((w: any) => w.day === idx);
    return {
      name: dayName,
      Ventas: match ? match.amount : 0
    };
  });

  // Color variables (Light Theme corporate palette)
  const COLORS = ['#003366', '#008080', '#D4AF37', '#800020', '#36454F'];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* ─── KPI CARDS SECTION ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Sales Card */}
        <BorderRotate
          borderRadius={24}
          borderWidth={2}
          backgroundColor="rgb(239, 246, 255)"
          gradientColors={{
            primary: '#93c5fd',
            secondary: '#3b82f6',
            accent: '#1d4ed8'
          }}
          className="shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-lg transition-all hover:-translate-y-0.5"
        >
          <div className="p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Ventas del Mes</p>
                <h3 className="text-xl md:text-2xl font-black text-[#003366] mt-1">
                  {fmtDop(generalData.salesMonth)}
                </h3>
              </div>
              <div className="p-3 bg-blue-100/80 rounded-xl text-[#003366] shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[11px] text-green-600 font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Hoy: {fmtDop(generalData.salesToday)}</span>
              <span className="text-on-surface-variant/60 font-medium ml-1">· Año: {fmtCompact(generalData.salesYear)}</span>
            </div>
          </div>
        </BorderRotate>

        {/* Purchases Card */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex flex-col justify-between hover:shadow-md transition-all hover:-translate-y-0.5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Compras del Mes</p>
              <h3 className="text-xl md:text-2xl font-black text-on-surface mt-1">
                {fmtDop(generalData.purchasesMonth)}
              </h3>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl text-rose-500 shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-4 text-[11px] text-on-surface-variant font-medium">
            <Activity className="w-3.5 h-3.5 text-on-surface-variant/50" />
            <span>CxP Pendiente: {fmtDop(generalData.payablesAmount)}</span>
          </div>
        </div>

        {/* Profit Card */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex flex-col justify-between hover:shadow-md transition-all hover:-translate-y-0.5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Ganancia Estimada</p>
              <h3 className="text-xl md:text-2xl font-black text-emerald-600 mt-1">
                {fmtDop(generalData.estimatedProfit)}
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-4 text-[11px] text-emerald-600 font-bold">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Margen Estimado: {((generalData.estimatedProfit / (generalData.salesMonth || 1)) * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Inventory Value Card */}
        <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl flex flex-col justify-between hover:shadow-md transition-all hover:-translate-y-0.5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Valor del Inventario</p>
              <h3 className="text-xl md:text-2xl font-black text-on-surface mt-1">
                {fmtDop(generalData.inventoryValue)}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-500 shrink-0">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-4 text-[11px] text-on-surface-variant font-medium">
            <Package className="w-3.5 h-3.5 text-on-surface-variant/50" />
            <span>Costo total: {fmtCompact(generalData.inventoryCost)}</span>
            <span className="text-on-surface-variant/60 font-medium ml-1">· Rotación: {generalData.inventoryTurnover.toFixed(1)}x</span>
          </div>
        </div>

      </div>

      {/* ─── OPERATIONAL COUNTS SECTION ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-surface-variant/30 p-4 rounded-2xl text-center border border-outline-variant/10">
          <p className="text-xs font-bold text-on-surface-variant">Facturas Emitidas</p>
          <p className="text-2xl font-extrabold text-on-surface mt-1">{generalData.countInvoices}</p>
        </div>
        <div className="bg-surface-variant/30 p-4 rounded-2xl text-center border border-outline-variant/10">
          <p className="text-xs font-bold text-on-surface-variant">Clientes Activos</p>
          <p className="text-2xl font-extrabold text-on-surface mt-1">{generalData.countCustomers}</p>
        </div>
        <div className="bg-surface-variant/30 p-4 rounded-2xl text-center border border-outline-variant/10">
          <p className="text-xs font-bold text-on-surface-variant">Monto por Cobrar</p>
          <p className="text-xl font-extrabold text-[#003366] mt-1">{fmtCompact(generalData.receivablesAmount)}</p>
        </div>
        <div className="bg-surface-variant/30 p-4 rounded-2xl text-center border border-outline-variant/10">
          <p className="text-xs font-bold text-on-surface-variant">Alertas de Stock</p>
          <p className="text-xl font-extrabold text-rose-500 mt-1">
            {generalData.productsOutOfStock} Agotado / {generalData.productsLowStock} Bajo
          </p>
        </div>
      </div>

      {/* ─── CHARTS SECTION ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Monthly Sales vs Purchases Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-lg mb-1">Ventas vs Compras Mensuales</h4>
          <p className="text-xs text-on-surface-variant mb-6">Comparativa de los últimos 6 meses de facturación y gastos</p>
          <div className="h-80">
            {comparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={comparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#003366" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#003366" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: '600' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
                  <RechartsTooltip 
                    formatter={(value: any) => [fmtDop(Number(value) || 0)]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', fontWeight: 'bold' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="Ventas" stroke="#003366" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                  <Area type="monotone" dataKey="Compras" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorPurchases)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-on-surface-variant/40">Sin datos de comparación suficientes</div>
            )}
          </div>
        </div>

        {/* Weekly Distribution Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-lg mb-1">Distribución Semanal de Ventas</h4>
          <p className="text-xs text-on-surface-variant mb-6">Monto total facturado agrupado por día de la semana</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: '600' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
                <RechartsTooltip 
                  formatter={(value: any) => [fmtDop(Number(value) || 0), 'Ventas']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', fontWeight: 'bold' }}
                />
                <Bar dataKey="Ventas" fill="#008080" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Seller Performance Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm lg:col-span-2">
          <h4 className="font-bold text-on-surface text-lg mb-1">Desempeño de Vendedores (Top 5)</h4>
          <p className="text-xs text-on-surface-variant mb-6">Monto total vendido por cada representante de ventas</p>
          <div className="h-80">
            {sellersData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sellersData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: '600' }} width={120} />
                  <RechartsTooltip 
                    formatter={(value: any) => [fmtDop(Number(value) || 0), 'Facturación']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Ventas" fill="#003366" radius={[0, 4, 4, 0]} barSize={20}>
                    {sellersData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-on-surface-variant/40">Sin datos de vendedores registrados</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
