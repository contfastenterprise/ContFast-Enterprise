'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

const COLORS = ['#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function DashboardTab({ data }: { data: any }) {
  const { kpis, aging, topCustomers } = data;

  const pieData = [
    { name: 'Vencido', value: kpis.totalOverdue },
    { name: 'Por Vencer', value: kpis.totalToMature },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright dark:bg-surface-dark-bright relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-16 h-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Total por Cobrar (Global)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-neutral-800 dark:text-neutral-100">
              {fmt(kpis.totalPending)}
            </div>
            <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
              <span className="text-emerald-500 font-medium">↑ 2.4%</span> vs mes anterior
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright dark:bg-surface-dark-bright relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-rose-500">
            <AlertCircle className="w-16 h-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Total Vencido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
              {fmt(kpis.totalOverdue)}
            </div>
            <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
              {((kpis.totalOverdue / (kpis.totalPending || 1)) * 100).toFixed(1)}% de la cartera total
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright dark:bg-surface-dark-bright relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-sky-500">
            <Clock className="w-16 h-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Total por Vencer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-sky-600 dark:text-sky-400">
              {fmt(kpis.totalToMature)}
            </div>
            <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
              De {kpis.pendingInvoicesCount} facturas activas
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright dark:bg-surface-dark-bright relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500">
            <CheckCircle2 className="w-16 h-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Índice de Recuperación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              87.5%
            </div>
            <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
              Promedio de cobro: 24 días
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Antigüedad */}
        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-neutral-800">Antigüedad de Saldos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aging} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value/1000}k`} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: any) => [fmt(Number(value)), 'Monto']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {aging.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico Cobrado vs Pendiente */}
        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-neutral-800">Estado de Cartera</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#ef4444" /> {/* Vencido */}
                    <Cell fill="#0ea5e9" /> {/* Por Vencer */}
                  </Pie>
                  <Tooltip formatter={(value: any) => [fmt(Number(value)), 'Monto']} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Top Clientes */}
        <Card className="shadow-sm border-outline-variant/20 bg-surface-bright">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-neutral-800">Top Clientes con Mayor Deuda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-surface-container-low text-neutral-500">
                  <tr>
                    <th className="px-6 py-3 rounded-tl-lg font-semibold">Cliente</th>
                    <th className="px-6 py-3 font-semibold text-right">Porcentaje de Cartera</th>
                    <th className="px-6 py-3 rounded-tr-lg font-semibold text-right">Deuda Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {topCustomers.map((c: any, i: number) => {
                    const percentage = kpis.totalPending > 0 ? (c.debt / kpis.totalPending) * 100 : 0;
                    return (
                      <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-6 py-4 font-medium text-neutral-800 dark:text-neutral-200">
                          {c.name}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-neutral-500 w-12">{percentage.toFixed(1)}%</span>
                            <div className="w-32 h-2 bg-surface-container-high rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${percentage}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-neutral-900">
                          {fmt(c.debt)}
                        </td>
                      </tr>
                    )
                  })}
                  {topCustomers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-neutral-500">
                        No hay clientes con deuda activa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
