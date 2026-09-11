'use client';

import React, { useState } from 'react';
import { Filter, X, PieChart } from 'lucide-react';
import type { NivelRiesgo } from '@/services/cartera/riesgo';
import type { EstadisticaNivel } from './tipos';
import { dineroCorto } from './tipos';

/**
 * La dona con la leyenda dentro, dibujada a mano en SVG.
 *
 * Sin libreria de graficas a proposito: son cuatro arcos sobre un circulo, y el
 * proyecto original tambien lo hace asi. Meter recharts para esto seria pagar un
 * peso que no hace falta.
 */
export function GraficaDonaRiesgo({
  stats,
  totalEntidades,
  totalSaldo,
  seleccionado,
  onSeleccionar,
  nombrePlural,
}: {
  stats: EstadisticaNivel[];
  totalEntidades: number;
  totalSaldo: number;
  seleccionado: NivelRiesgo | null;
  onSeleccionar: (n: NivelRiesgo | null) => void;
  nombrePlural: string;
}) {
  const [encima, setEncima] = useState<NivelRiesgo | null>(null);

  const tamano = 300;
  const grosor = 32;
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const centro = tamano / 2;

  const activoKey = encima || seleccionado;
  const activo = stats.find((s) => s.key === activoKey);

  let acumulado = 0;
  const segmentos = stats.map((s) => {
    const dash = `${(s.porcentaje / 100) * circunferencia} ${circunferencia}`;
    const offset = -((acumulado / 100) * circunferencia);
    acumulado += s.porcentaje;
    const esActivo = seleccionado === s.key;
    const esEncima = encima === s.key;
    return {
      ...s,
      dash,
      offset,
      esActivo,
      esEncima,
      apagado: (seleccionado !== null && !esActivo) || (encima !== null && !esEncima && seleccionado === null),
    };
  });

  return (
    <div
      className="flex flex-col items-center justify-center p-4 bg-white rounded-xl border border-neutral-200/80 shadow-xs relative"
      data-dona-riesgo
    >
      <div className="w-full flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <PieChart className="w-4 h-4 text-neutral-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
            Distribución de Riesgo
          </span>
          <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full font-medium">
            {totalEntidades} {nombrePlural}
          </span>
        </div>
        {seleccionado && (
          <button
            onClick={() => onSeleccionar(null)}
            className="text-[11px] text-neutral-600 hover:text-neutral-900 flex items-center gap-1 px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors cursor-pointer"
            title="Quitar filtro de riesgo"
          >
            <X className="w-3 h-3 text-neutral-600" />
            <span>Restablecer</span>
          </button>
        )}
      </div>

      <div className="relative flex items-center justify-center my-1 select-none">
        <svg
          width={tamano}
          height={tamano}
          viewBox={`0 0 ${tamano} ${tamano}`}
          className="transform -rotate-90 select-none overflow-visible"
          role="img"
          aria-label={`Distribución de ${nombrePlural} por nivel de riesgo`}
        >
          <circle cx={centro} cy={centro} r={radio} fill="transparent" stroke="#f1f5f9" strokeWidth={grosor} />
          {segmentos.map((seg) => (
            <circle
              key={seg.key}
              cx={centro}
              cy={centro}
              r={radio}
              fill="transparent"
              stroke={seg.config.color}
              strokeWidth={seg.esEncima || seg.esActivo ? grosor + 6 : grosor}
              strokeDasharray={seg.dash}
              strokeDashoffset={seg.offset}
              strokeLinecap="butt"
              className={`transition-all duration-200 cursor-pointer ${seg.apagado ? 'opacity-30' : 'opacity-100'}`}
              onMouseEnter={() => setEncima(seg.key)}
              onMouseLeave={() => setEncima(null)}
              onClick={() => onSeleccionar(seleccionado === seg.key ? null : seg.key)}
            />
          ))}
        </svg>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center"
          style={{ width: `${tamano}px`, height: `${tamano}px` }}
        >
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              {activo ? activo.config.etiqueta : 'Cartera Consolidada'}
            </span>
            <div className="text-lg font-bold text-neutral-900 tracking-tight leading-none mt-0.5 tabular-nums">
              {dineroCorto(activo ? activo.saldo : totalSaldo)}
            </div>
          </div>

          <div className="w-[185px] bg-neutral-50/90 backdrop-blur-xs rounded-xl p-2 border border-neutral-200/90 shadow-2xs">
            <div className="text-[9px] uppercase font-bold tracking-wider text-neutral-500 mb-1 flex items-center justify-between border-b border-neutral-200/70 pb-0.5">
              <span>Leyenda Interna</span>
              <span className="font-mono">{activo ? `${activo.porcentaje.toFixed(0)}%` : '100%'}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-1.5 gap-y-1 text-left">
              {stats.map((s) => {
                const enfocado = seleccionado === s.key || encima === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => onSeleccionar(seleccionado === s.key ? null : s.key)}
                    onMouseEnter={() => setEncima(s.key)}
                    onMouseLeave={() => setEncima(null)}
                    className={`flex items-center justify-between px-1.5 py-1 rounded transition-all cursor-pointer text-left ${
                      enfocado ? 'bg-white ring-1 ring-neutral-800 shadow-xs' : 'hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.config.color }} />
                      <span className="text-[10px] font-semibold text-neutral-800 truncate">
                        {s.config.etiquetaCorta.replace('Riesgo ', '')}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700 font-mono ml-1 shrink-0">
                      {s.porcentaje.toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1 font-medium">
            <Filter className="w-2.5 h-2.5 text-neutral-400" />
            <span>{seleccionado ? 'Filtro aplicado' : 'Clic para filtrar'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
