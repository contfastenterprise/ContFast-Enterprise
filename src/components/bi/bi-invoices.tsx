'use client';

import React from 'react';
import { 
  FileText, CheckCircle2, AlertCircle, Clock, 
  TrendingUp, FileMinus, Landmark, ShieldCheck 
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';

interface BIInvoicesProps {
  data: any;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

const mapEcfName = (type: string) => {
  switch (type) {
    case '31': return 'Factura de Crédito Fiscal (E31)';
    case '32': return 'Factura de Consumo (E32)';
    case '33': return 'Nota de Débito (E33)';
    case '34': return 'Nota de Crédito (E34)';
    case '41': return 'Compras del Exterior (E41)';
    case '43': return 'Gastos Menores (E43)';
    case '44': return 'Regímenes Especiales (E44)';
    case '45': return 'Gubernamentales (E45)';
    default: return `Comprobante Electrónico (E${type})`;
  }
};

const mapStatusName = (status: string) => {
  switch (status.toLowerCase()) {
    case 'accepted': return 'Aceptado por DGII';
    case 'signed': return 'Firmado (Listo para envío)';
    case 'submitted': return 'Enviado (Procesando)';
    case 'draft': return 'Borrador';
    case 'void': return 'Anulado';
    case 'rejected': return 'Rechazado por DGII';
    default: return status.toUpperCase();
  }
};

export default function BIInvoices({ data }: BIInvoicesProps) {
  if (!data) return null;

  const ecf = data.ecf || [];
  const hourly = data.hourly || [];
  const statusCounts = data.statusCounts || [];
  const monthlyHistory = data.monthlyHistory || [];

  // Group status for Pie Chart
  const statusChartData = statusCounts.map((sc: any) => ({
    name: mapStatusName(sc.status),
    value: sc.count,
    amount: sc.amount
  }));

  const COLORS = ['#003366', '#008080', '#D4AF37', '#800020', '#36454F', '#FF4500'];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* ─── API COUNTS BADGES ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {statusCounts.map((sc: any) => {
          let icon = <FileText className="w-5 h-5" />;
          let iconBg = 'bg-surface-variant/30 text-on-surface-variant';

          if (sc.status === 'accepted') {
            icon = <CheckCircle2 className="w-5 h-5" />;
            iconBg = 'bg-green-50 text-green-600';
          } else if (sc.status === 'rejected') {
            icon = <AlertCircle className="w-5 h-5" />;
            iconBg = 'bg-red-50 text-red-500';
          } else if (sc.status === 'submitted') {
            icon = <Clock className="w-5 h-5" />;
            iconBg = 'bg-blue-50 text-blue-500';
          }

          return (
            <div 
              key={sc.status} 
              className="bg-surface-bright border border-outline-variant/30 p-5 rounded-3xl flex items-center gap-4 shadow-sm"
            >
              <div className={`p-3 rounded-2xl shrink-0 ${iconBg}`}>{icon}</div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">{mapStatusName(sc.status)}</p>
                <h4 className="text-lg font-black text-on-surface mt-0.5">{sc.count}</h4>
                <p className="text-[10px] text-on-surface-variant/60 font-mono mt-0.5">{fmtDop(sc.amount)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── CHARTS SECTION ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Hourly Sales Activity */}
        <div className="lg:col-span-2 bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <h4 className="font-bold text-on-surface text-base mb-1">Picos de Facturación por Hora</h4>
          <p className="text-xs text-on-surface-variant mb-6">Monto acumulado de ventas según la hora del día</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#003366" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#003366" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tickFormatter={(hour) => `${hour}:00`} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `RD$${(value / 1000)}k`} />
                <RechartsTooltip formatter={(value: any) => [fmtDop(Number(value))]} />
                <Area type="monotone" dataKey="amount" stroke="#003366" strokeWidth={3} fillOpacity={1} fill="url(#colorHourly)" name="Facturación" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution Pie Chart */}
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-on-surface text-base mb-1">Composición del Estado e-CF</h4>
            <p className="text-xs text-on-surface-variant mb-4">Proporción del volumen de facturas enviadas a la DGII</p>
          </div>
          <div className="h-64 flex justify-center items-center">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusChartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: any) => [`${value} Facturas`]} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-on-surface-variant text-sm">Sin datos de estado de facturas</div>
            )}
          </div>
        </div>

      </div>

      {/* ─── E-CF BREAKDOWN TABLE ─── */}
      <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
        <h4 className="font-bold text-on-surface text-base mb-4">Desglose Fiscal por Tipo de Comprobante (e-CF)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Tipo Comprobante</th>
                <th className="px-4 py-3 text-right">Cant. Emitida</th>
                <th className="px-4 py-3 text-right rounded-r-lg">Monto Total Facturado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {ecf.map((e: any) => (
                <tr key={e.type} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-on-surface">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      {mapEcfName(e.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-on-surface-variant">
                    {e.count.toLocaleString('es-DO')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-primary">
                    {fmtDop(e.amount)}
                  </td>
                </tr>
              ))}
              {ecf.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-on-surface-variant">No se registran comprobantes electrónicos en este período</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
