'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { WalletCards, AlertTriangle, Clock, TrendingUp, HandCoins } from 'lucide-react';

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function DashboardTab({ data }: { data: any }) {
  const { kpis, charts } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-surface-bright border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Total por Pagar</CardTitle>
            <WalletCards className="w-5 h-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">{fmt(kpis.totalPorPagar)}</div>
            <p className="text-xs text-neutral-500 mt-1">Saldo pendiente total</p>
          </CardContent>
        </Card>
        
        <Card className="bg-surface-bright border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Total Vencido</CardTitle>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{fmt(kpis.totalVencido)}</div>
            <p className="text-xs text-neutral-500 mt-1">
              {kpis.totalPorPagar > 0 ? ((kpis.totalVencido / kpis.totalPorPagar) * 100).toFixed(1) : 0}% del total adeudado
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-bright border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Total por Vencer</CardTitle>
            <Clock className="w-5 h-5 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">{fmt(kpis.totalPorVencer)}</div>
            <p className="text-xs text-neutral-500 mt-1">Obligaciones al día</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-bright border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Pagado este mes</CardTitle>
            <HandCoins className="w-5 h-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmt(kpis.pagadoEsteMes)}</div>
            <p className="text-xs text-neutral-500 mt-1">Flujo de salida mensual</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Antigüedad de Cuentas por Pagar */}
        <Card className="col-span-1 lg:col-span-2 shadow-sm border-outline-variant/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Antigüedad de Cuentas por Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.agingData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value/1000}k`} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: any) => [fmt(Number(value)), 'Monto']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {charts.agingData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : index === 2 ? '#f97316' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Evolución Mensual */}
        <Card className="shadow-sm border-outline-variant/30">
          <CardHeader>
            <CardTitle className="text-base">Evolución de Deuda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.monthlyData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: any) => [fmt(Number(value)), 'Monto']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Suplidores */}
        <Card className="col-span-1 lg:col-span-2 shadow-sm border-outline-variant/30">
          <CardHeader>
            <CardTitle className="text-base">Top 10 Suplidores (Saldos Pendientes)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {charts.topSuppliers.length === 0 ? (
                <div className="text-center text-neutral-500 py-8">No hay cuentas por pagar registradas.</div>
              ) : (
                charts.topSuppliers.map((supplier: any, index: number) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex flex-col max-w-[50%]">
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{supplier.name}</span>
                    </div>
                    <div className="flex items-center gap-4 w-1/2">
                      <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full" 
                          style={{ width: `${(supplier.balance / kpis.totalPorPagar) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-24 text-right">{fmt(supplier.balance)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gastos por Categoría */}
        <Card className="shadow-sm border-outline-variant/30">
          <CardHeader>
            <CardTitle className="text-base">Gastos por Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.categoriesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {charts.categoriesData.map((entry: any, index: number) => {
                      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Pie>
                  <Tooltip formatter={(value: any) => [fmt(Number(value)), 'Monto']} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
