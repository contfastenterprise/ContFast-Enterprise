'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Receipt, HandCoins, AlertTriangle,
  ArrowRightLeft, FileText, BarChart3, RefreshCw, Landmark, ShieldCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';

import Loading from '../accounting/loading';

interface SummaryData {
  cxc: {
    totalPending: number;
    totalOverdue: number;
    topDebtors: any[];
    morososCount: number;
    alDiaCount: number;
    topVolCustomers: any[];
  };
  cxp: {
    totalPending: number;
    totalOverdue: number;
    topCreditors: any[];
    topVolSuppliers: any[];
  };
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function FinancialDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/financial/dashboard');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Error al obtener datos');
      }
      setData(json.data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  if (error) {
    return (

      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="w-16 h-16 text-rose-600" />
        <h2 className="text-xl font-bold">Error al cargar el dashboard</h2>
        <p className="text-slate-500">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>

    );
  }

  const cxcPending = data?.cxc.totalPending || 0;
  const cxcOverdue = data?.cxc.totalOverdue || 0;
  const cxpPending = data?.cxp.totalPending || 0;
  const cxpOverdue = data?.cxp.totalOverdue || 0;
  const netWorkingCapital = cxcPending - cxpPending;

  // Chart data
  const comparisonChartData = [
    { name: 'Cuentas por Cobrar (CxC)', Pendiente: cxcPending, Vencido: cxcOverdue },
    { name: 'Cuentas por Pagar (CxP)', Pendiente: cxpPending, Vencido: cxpOverdue },
  ];

  const pieChartData = [
    { name: 'Clientes al Día', value: data?.cxc.alDiaCount || 0 },
    { name: 'Clientes Morosos', value: data?.cxc.morososCount || 0 },
  ].filter(item => item.value > 0);

  return (

    <div className="w-full space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="text-[#003366] w-7 h-7" /> Dashboard de Control Financiero
          </h1>
          <p className="text-sm text-slate-500">
            Resumen ejecutivo y estado general de las Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP).
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Recargar
        </button>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center text-[#003366]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CxC Pendiente</span>
            <HandCoins className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold">{fmt(cxcPending)}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className="font-semibold text-rose-600">{fmt(cxcOverdue)}</span> vencido
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CxC Vencido</span>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-rose-600">{fmt(cxcOverdue)}</div>
          <div className="text-xs text-slate-500">
            {cxcPending > 0 ? ((cxcOverdue / cxcPending) * 100).toFixed(1) : 0}% del total pendiente
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center text-[#C5A059]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CxP Pendiente</span>
            <Receipt className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold">{fmt(cxpPending)}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className="font-semibold text-rose-600">{fmt(cxpOverdue)}</span> vencido
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CxP Vencido</span>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-rose-600">{fmt(cxpOverdue)}</div>
          <div className="text-xs text-slate-500">
            {cxpPending > 0 ? ((cxpOverdue / cxpPending) * 100).toFixed(1) : 0}% del total pendiente
          </div>
        </div>

        <div className={clsx(
          "border rounded-2xl p-5 space-y-2 lg:col-span-1 sm:col-span-2",
          netWorkingCapital >= 0
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
            : "bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400"
        )}>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Balance Neto (CxC - CxP)</span>
            {netWorkingCapital >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
          <div className="text-xl font-bold">{fmt(netWorkingCapital)}</div>
          <div className="text-xs text-slate-500">
            {netWorkingCapital >= 0 ? 'Excedente de cobros sobre pagos' : 'Déficit de capital de trabajo'}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart CxC vs CxP */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <BarChart3 className="w-4 h-4" /> Comparativa de Saldos (CxC vs CxP)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={comparisonChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(value) => fmt(value as number)} />
                <Legend />
                <Bar dataKey="Pendiente" fill="#3a5f94" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vencido" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart Client Health */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 flex flex-col justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <Users className="w-4 h-4" /> Distribución de Clientes CxC
          </h3>
          <div className="h-48 w-full flex justify-center items-center">
            {pieChartData.length === 0 ? (
              <span className="text-xs text-slate-500">No hay datos suficientes</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsPieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Clientes al Día:</span>
              <span className="font-bold">{data?.cxc.alDiaCount || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> Clientes Morosos:</span>
              <span className="font-bold text-rose-600">{data?.cxc.morososCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Debtors Table */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <HandCoins className="w-4 h-4 text-[#003366]" /> Clientes con Mayor Deuda (CxC)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">RNC/Cédula</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Pendiente</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Vencido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.cxc.topDebtors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-xs text-center text-slate-500">No hay clientes con deuda pendiente</td>
                  </tr>
                ) : (
                  data?.cxc.topDebtors.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold">{c.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{c.rnc_cedula || 'N/A'}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono font-bold">{fmt(c.pending_balance)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-rose-600 font-bold">{c.overdue_balance > 0 ? fmt(c.overdue_balance) : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Creditors Table */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <Receipt className="w-4 h-4 text-[#C5A059]" /> Suplidores con Mayor Saldo Pendiente (CxP)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">RNC</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Saldo Pendiente</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Saldo Vencido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.cxp.topCreditors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-xs text-center text-slate-500">No hay cuentas por pagar pendientes</td>
                  </tr>
                ) : (
                  data?.cxp.topCreditors.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold">{s.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{s.rnc || 'N/A'}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono font-bold">{fmt(s.pending_balance)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-rose-600 font-bold">{s.overdue_balance > 0 ? fmt(s.overdue_balance) : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Volume Rankings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Sales Customers */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Clientes con Mayor Volumen de Ventas (Facturado)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Facturas Emitidas</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Total Facturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.cxc.topVolCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-xs text-center text-slate-500">No hay ventas registradas</td>
                  </tr>
                ) : (
                  data?.cxc.topVolCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold">{c.name}</td>
                      <td className="px-4 py-2.5 text-xs text-right text-slate-500">{c.invoice_count}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(c.total_invoiced)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Purchase Suppliers */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
            <TrendingDown className="w-4 h-4 text-rose-500" /> Suplidores con Mayor Volumen de Compras (Gastos)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Transacciones</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Total Comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.cxp.topVolSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-xs text-center text-slate-500">No hay compras/gastos registrados</td>
                  </tr>
                ) : (
                  data?.cxp.topVolSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold">{s.name}</td>
                      <td className="px-4 py-2.5 text-xs text-right text-slate-500">{s.purchase_count}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-rose-600 dark:text-rose-400">{fmt(s.total_purchased)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

  );
}
