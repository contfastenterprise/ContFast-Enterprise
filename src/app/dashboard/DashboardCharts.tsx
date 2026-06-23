'use client';

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
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

interface DashboardChartsProps {
  chartData: ChartDataPoint[];
  comparisonChart: ComparisonDataPoint[];
  period?: 'semana' | 'mes';
}

const fmt = (val: number, compact = false) => {
  if (compact && val >= 1_000_000) return `RD$ ${(val / 1_000_000).toFixed(1)}M`;
  if (compact && val >= 1_000) return `RD$ ${(val / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function DashboardCharts({ chartData, comparisonChart, period = 'semana' }: DashboardChartsProps) {
  const isWeekly = period === 'semana';

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
          <ResponsiveContainer width="100%" height="100%">
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} dy={10} minTickGap={20} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
              <RechartsTooltip 
                formatter={(value: any, name: any) => [fmt(Number(value) || 0), name === 'sales' ? 'Ventas' : 'Compras']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
              <Bar dataKey="sales" name="Ventas" fill="#003366" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" name="Compras" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
