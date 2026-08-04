'use client';

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';

interface ChartDataPoint {
  day: string;
  pct: number;
  amount: number;
}

interface ComparisonDataPoint {
  day: string;
  sales: number;
  purchases: number;
}

interface CategoryDataPoint {
  name: string;
  value: number;
  amount: number;
  color: string;
}

interface DashboardChartsProps {
  chartData: ChartDataPoint[];
  comparisonChart: ComparisonDataPoint[];
  categoryData: CategoryDataPoint[];
  collectionStatusData: CategoryDataPoint[];
  period?: 'semana' | 'mes';
}

const fmt = (val: number, compact = false) => {
  if (compact && val >= 1_000_000) return `RD$ ${(val / 1_000_000).toFixed(1)}M`;
  if (compact && val >= 1_000) return `RD$ ${(val / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function DashboardCharts({ chartData, comparisonChart, categoryData = [], collectionStatusData = [], period = 'semana' }: DashboardChartsProps) {
  const isWeekly = period === 'semana';
  const totalAmount = categoryData.reduce((acc, curr) => acc + curr.amount, 0);
  const collectionTotal = collectionStatusData.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Line Chart for Sales Trend */}
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-headline-md text-xl font-bold text-primary">Flujo de Ventas (Lineal)</h4>
            <p className="text-body-sm text-on-surface-variant/60 font-medium">
              {isWeekly ? 'Tendencia de los últimos 7 días' : 'Tendencia de los últimos 30 días'}
            </p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} dy={10} minTickGap={20} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
              <RechartsTooltip 
                formatter={(value: any) => [fmt(Number(value) || 0), 'Ventas']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
              />
              <Line type="monotone" dataKey="amount" stroke="#003366" strokeWidth={4} dot={isWeekly ? { r: 4, fill: '#003366', strokeWidth: 2, stroke: '#fff' } : false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart for Sales vs Purchases */}
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-headline-md text-xl font-bold text-primary">Ventas vs Compras</h4>
            <p className="text-body-sm text-on-surface-variant/60 font-medium">
              {isWeekly ? 'Comparativa de los últimos 7 días' : 'Comparativa de los últimos 30 días'}
            </p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={comparisonChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} dy={10} minTickGap={20} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
              <RechartsTooltip 
                formatter={(value: any, name: any) => [fmt(Number(value) || 0), name]}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
              <Bar dataKey="sales" name="Ventas" fill="#003366" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" name="Compras" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Donut Chart for Sales by Category */}
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-headline-md text-xl font-bold text-primary">Ventas por categoría</h4>
          </div>
        </div>
        <div className="flex items-center justify-between h-72">
          <div className="relative w-1/2 h-full flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <PieChart>
                <Pie
                  data={categoryData}
                  innerRadius="65%"
                  outerRadius="95%"
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: any, name: any, props: any) => [fmt(props.payload.amount), props.payload.name]} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-bold text-slate-700">Total</span>
              <span className="text-base font-extrabold text-slate-900 mt-1">
                RD$ {totalAmount.toLocaleString('es-DO')}
              </span>
            </div>
          </div>
          
          <div className="w-1/2 pl-4 flex flex-col gap-3 justify-center overflow-y-auto max-h-full pr-2" style={{ scrollbarWidth: 'thin' }}>
            {categoryData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-[13px] font-bold text-slate-700">{item.name}</span>
                </div>
                <span className="text-[13px] font-bold text-slate-600">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Half-Donut Chart for Collection Status */}
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-headline-md text-xl font-bold text-primary">Estado de Cobros</h4>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between h-72">
          <div className="relative w-full h-[60%] flex justify-center items-end mt-4">
            <ResponsiveContainer width="100%" height="200%" minWidth={1} minHeight={1}>
              <PieChart>
                <Pie
                  data={collectionStatusData}
                  startAngle={180}
                  endAngle={0}
                  cx="50%"
                  cy="100%"
                  innerRadius="65%"
                  outerRadius="95%"
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {collectionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: any, name: any, props: any) => [fmt(props.payload.amount), 'Total']} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute bottom-0 w-full flex flex-col items-center pointer-events-none mb-2">
              <span className="text-sm font-bold text-slate-700">Total Facturado</span>
              <span className="text-xl font-extrabold text-slate-900 mt-0.5">
                RD$ {collectionTotal.toLocaleString('es-DO')}
              </span>
            </div>
          </div>
          
          <div className="w-full flex justify-center gap-6 mt-6 pb-2">
            {collectionStatusData.map((item, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-xs font-bold text-slate-700">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-600">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
