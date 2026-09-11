'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import type { NivelRiesgo } from '@/services/cartera/riesgo';
import type { EstadisticaNivel } from './tipos';
import { dineroCorto } from './tipos';
import { IconoRiesgo } from './iconosRiesgo';

export function LeyendaRiesgo({
  stats,
  seleccionado,
  onSeleccionar,
}: {
  stats: EstadisticaNivel[];
  seleccionado: NivelRiesgo | null;
  onSeleccionar: (n: NivelRiesgo | null) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200/90 px-3 py-2.5 shadow-xs" data-leyenda-riesgo>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="hidden xl:flex items-center gap-1.5 pr-2 border-r border-neutral-200 shrink-0">
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
            Niveles de Riesgo:
          </span>
          {seleccionado && (
            <button
              onClick={() => onSeleccionar(null)}
              className="text-[10px] text-neutral-500 hover:text-neutral-800 flex items-center gap-0.5 px-1.5 py-0.5 bg-neutral-100 rounded cursor-pointer"
              title="Quitar filtro"
            >
              <X className="w-3 h-3" />
              <span>Ver todos</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-1">
          {stats.map((s) => {
            const activo = seleccionado === s.key;
            const apagado = seleccionado !== null && !activo;
            return (
              <button
                key={s.key}
                onClick={() => onSeleccionar(activo ? null : s.key)}
                data-nivel={s.key}
                aria-pressed={activo}
                title={`${s.config.etiqueta}: ${s.config.descripcion} — ${dineroCorto(s.saldo)}`}
                className={`relative flex items-center justify-between p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  activo
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                    : apagado
                    ? 'opacity-40 hover:opacity-75 bg-neutral-50 border-neutral-200'
                    : 'bg-white hover:bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: s.config.color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      {activo ? <Check className="w-3 h-3 text-emerald-400" /> : <IconoRiesgo nivel={s.key} className="w-3.5 h-3.5" />}
                      <span className={`text-xs font-bold truncate ${activo ? 'text-white' : 'text-neutral-900'}`}>
                        {s.config.etiquetaCorta}
                      </span>
                    </div>
                    {/* El criterio, escrito. Un color no explica por que ese
                        cliente esta ahi; "atraso de 16 a 45 dias" si. */}
                    <p className={`text-[10px] truncate ${activo ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      {s.config.criterio}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center justify-end gap-1">
                    <span className={`text-xs font-bold font-mono ${activo ? 'text-white' : 'text-neutral-900'}`}>
                      {s.cantidad}
                    </span>
                    <span className={`text-[10px] ${activo ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      ({s.porcentaje.toFixed(0)}%)
                    </span>
                  </div>
                  <span className={`text-[10px] font-medium tabular-nums ${activo ? 'text-neutral-200' : 'text-neutral-600'}`}>
                    {dineroCorto(s.saldo)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
