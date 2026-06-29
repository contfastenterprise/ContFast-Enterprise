'use client';

import React, { useState } from 'react';
import { 
  Users, TrendingUp, Calendar, AlertCircle, 
  Phone, Mail, ArrowUpRight, DollarSign, Award 
} from 'lucide-react';

interface BICustomersProps {
  data: any;
  onNavigateToCustomer?: (customerId: string) => void;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function BICustomers({ data, onNavigateToCustomer }: BICustomersProps) {
  const [subView, setSubView] = useState<'ranking' | 'inactive'>('ranking');

  if (!data) return null;

  const ranking = data.ranking || [];
  const inactiveCustomers = data.inactiveCustomers || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      
      {/* View Selector */}
      <div className="flex border-b border-outline-variant/30">
        <button
          onClick={() => setSubView('ranking')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subView === 'ranking' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Ranking de Clientes (Compradores)
        </button>
        <button
          onClick={() => setSubView('inactive')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subView === 'inactive' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Clientes Inactivos (Alerta)
        </button>
      </div>

      {/* ─── VIEW CONTENT: RANKING ─── */}
      {subView === 'ranking' && (
        <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="font-bold text-on-surface text-base">Clasificación de Clientes (Mayores Compradores)</h4>
              <p className="text-xs text-on-surface-variant">Métricas acumuladas de facturas, ticket promedio, deudas y frecuencias</p>
            </div>
            <Award className="w-8 h-8 text-amber-500" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg text-center">Rank</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Facturas</th>
                  <th className="px-4 py-3 text-right">Ticket Promedio</th>
                  <th className="px-4 py-3 text-right">Deuda Actual</th>
                  <th className="px-4 py-3 text-right">Total Comprado</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Última Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {ranking.map((s: any) => (
                  <tr 
                    key={s.id} 
                    onClick={() => onNavigateToCustomer?.(s.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 text-center font-extrabold text-on-surface-variant/40">
                      {s.ranking === 1 ? '🥇' : s.ranking === 2 ? '🥈' : s.ranking === 3 ? '🥉' : `#${s.ranking}`}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-on-surface">
                      {s.name}
                      <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">RNC/Cédula: {s.rnc}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant font-medium">
                      {s.invoiceCount}
                    </td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant font-medium">
                      {fmtDop(s.averageTicket)}
                    </td>
                    <td className={`px-4 py-3.5 text-right font-semibold ${s.debt > 0 ? 'text-red-500' : 'text-on-surface-variant/40'}`}>
                      {s.debt > 0 ? fmtDop(s.debt) : 'RD$ 0.00'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-primary">
                      {fmtDop(s.totalSpent)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-on-surface-variant/60 text-xs">
                      {s.lastPurchase}
                    </td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-on-surface-variant">Sin datos de compras para los filtros indicados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── VIEW CONTENT: INACTIVE CUSTOMERS ─── */}
      {subView === 'inactive' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Inactive Customers List */}
          <div className="lg:col-span-2 bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
            <h4 className="font-bold text-on-surface text-base mb-1">Clientes en Alerta (Sin Compras en los Últimos 60 Días)</h4>
            <p className="text-xs text-on-surface-variant mb-6">Clientes recurrentes del negocio que han dejado de facturar recientemente</p>
            
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-variant/30 text-xs font-bold text-on-surface-variant uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Contacto</th>
                    <th className="px-4 py-3 text-right">Última Compra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {inactiveCustomers.map((ic: any) => (
                    <tr 
                      key={ic.id} 
                      onClick={() => onNavigateToCustomer?.(ic.id)}
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 font-bold text-on-surface">
                        {ic.name}
                        <span className="text-[10px] text-on-surface-variant/60 font-mono block mt-0.5">RNC: {ic.rnc}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-on-surface-variant flex flex-col gap-0.5">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-on-surface-variant/40" /> {ic.phone}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-rose-500 text-xs">
                        {ic.lastPurchase}
                      </td>
                    </tr>
                  ))}
                  {inactiveCustomers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-on-surface-variant">Todos tus clientes registran compras recientes</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Retention advice card */}
          <div className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="p-3 bg-rose-50 text-rose-500 rounded-xl w-fit">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-on-surface text-base">Estrategia de Retención de Clientes</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Adquirir un cliente nuevo cuesta hasta **5 veces más** que retener uno actual.
              </p>
              <div className="bg-surface-variant/30 p-4 rounded-2xl space-y-2">
                <p className="text-xs font-bold text-on-surface">Siguientes Pasos:</p>
                <ul className="text-xs text-on-surface-variant space-y-1.5 list-disc list-inside">
                  <li>Contactar al cliente directamente (llamada/correo).</li>
                  <li>Ofrecer un cupón de descuento de reactivación.</li>
                  <li>Preguntar si tuvo inconvenientes en su última orden.</li>
                  <li>Revisar si su ejecutivo de cuenta fue cambiado.</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
