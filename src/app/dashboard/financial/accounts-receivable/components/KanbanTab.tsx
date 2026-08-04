'use client';

import React, { useMemo } from 'react';
import { Clock, AlertCircle, Calendar, PhoneCall, CheckCircle } from 'lucide-react';

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function KanbanTab({ data }: { data: any[] }) {
  const columns = useMemo(() => {
    const cols = {
      alDia: { title: 'Al Día (Pendiente)', icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, items: [] as any[] },
      porVencer: { title: 'Por Vencer (≤ 7 días)', icon: <Clock className="w-4 h-4 text-sky-500" />, items: [] as any[] },
      venceHoy: { title: 'Vence Hoy', icon: <Calendar className="w-4 h-4 text-amber-500" />, items: [] as any[] },
      vencidas: { title: 'Vencidas', icon: <AlertCircle className="w-4 h-4 text-rose-500" />, items: [] as any[] },
      gestion: { title: 'En Gestión de Cobro', icon: <PhoneCall className="w-4 h-4 text-purple-500" />, items: [] as any[] },
    };

    const now = new Date();
    now.setHours(0,0,0,0);

    data.forEach(item => {
      if (Number(item.balance) <= 0) return;

      const due = new Date(item.dueDate);
      due.setHours(0,0,0,0);
      
      const diffTime = now.getTime() - due.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Asignación simple para el kanban basado en fechas (simulando "en gestión" si tiene status)
      if (item.status === 'in_collection') {
        cols.gestion.items.push({ ...item, diffDays });
      } else if (diffDays > 0) {
        cols.vencidas.items.push({ ...item, diffDays });
      } else if (diffDays === 0) {
        cols.venceHoy.items.push({ ...item, diffDays });
      } else if (diffDays >= -7) {
        cols.porVencer.items.push({ ...item, diffDays });
      } else {
        cols.alDia.items.push({ ...item, diffDays });
      }
    });

    return Object.values(cols);
  }, [data]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-250px)] min-h-[500px]">
      {columns.map((col, i) => (
        <div key={i} className="flex-none w-80 bg-surface-container-lowest border border-outline-variant/20 rounded-xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low rounded-t-xl">
            <div className="flex items-center gap-2 font-semibold text-neutral-800 dark:text-neutral-200">
              {col.icon}
              {col.title}
            </div>
            <div className="bg-surface-container-high text-xs font-bold px-2 py-1 rounded-full text-neutral-600">
              {col.items.length}
            </div>
          </div>
          
          {/* Tarjetas */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {col.items.map((item, j) => (
              <div key={j} className="bg-white dark:bg-surface-dark-bright border border-outline-variant/30 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-neutral-500 group-hover:text-primary transition-colors">
                    FC-{item.id.split('-')[0].toUpperCase()}
                  </span>
                  <span className="text-xs bg-surface-container text-neutral-600 px-2 py-0.5 rounded-full">
                    {new Date(item.dueDate).toLocaleDateString('es-DO', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <h4 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200 line-clamp-1 mb-1">
                  {item.customerName}
                </h4>
                <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {fmt(Number(item.balance))}
                </div>
                {item.diffDays > 0 && (
                  <div className="text-xs text-rose-500 font-medium mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Vencida hace {item.diffDays} días
                  </div>
                )}
                {item.diffDays === 0 && (
                  <div className="text-xs text-amber-500 font-medium mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Vence hoy
                  </div>
                )}
              </div>
            ))}
            
            {col.items.length === 0 && (
              <div className="h-24 border-2 border-dashed border-outline-variant/30 rounded-lg flex items-center justify-center text-sm text-neutral-400">
                Sin facturas
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
