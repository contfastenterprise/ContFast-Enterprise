'use client';

import React from 'react';
import { DollarSign, Users, AlertTriangle, TrendingUp } from 'lucide-react';
import type { FilaCartera, TipoCartera } from './tipos';
import { PALABRAS, dineroCorto } from './tipos';

export function TarjetasResumen({ filas, tipo }: { filas: FilaCartera[]; tipo: TipoCartera }) {
  const P = PALABRAS[tipo];

  const saldoTotal = filas.reduce((a, f) => a + f.saldo, 0);
  const cupoTotal = filas.reduce((a, f) => a + (f.cupoCredito ?? 0), 0);
  const hayCupo = filas.some((f) => f.cupoCredito !== null);

  const enRiesgo = filas.filter((f) => f.nivelRiesgo === 'alto' || f.nivelRiesgo === 'critico');
  const saldoEnRiesgo = enRiesgo.reduce((a, f) => a + f.saldo, 0);
  const alDia = filas.filter((f) => f.nivelRiesgo === 'bajo');

  // LA MEDIA SOLO DE LOS QUE TIENEN VARIACION.
  //
  // Una variacion `null` significa "el mes anterior fue cero, no hay contra que
  // comparar". Contarla como 0 al promediar la convertiria en un dato: un
  // cliente que no facturo el mes pasado arrastraria la media hacia abajo como
  // si hubiera caido, cuando lo que pasa es que no se sabe.
  const conVariacion = filas
    .map((f) => f.mensual[f.mensual.length - 1]?.variacion)
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const media = conVariacion.length > 0
    ? conVariacion.reduce((a, v) => a + v, 0) / conVariacion.length
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-tarjetas-resumen>
      <div className="bg-white p-4 rounded-xl border border-neutral-200/90 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{P.totalTitulo}</span>
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-neutral-900 tracking-tight tabular-nums">
          {dineroCorto(saldoTotal)}
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">
          {/* Los suplidores NO tienen cupo en la base. Aqui no se enseña un
              cero que se leeria como "cupo agotado": se enseña otra cosa. */}
          {hayCupo ? `Cupo total: ${dineroCorto(cupoTotal)}` : P.totalPie}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-neutral-200/90 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Total {P.entidades}
          </span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-neutral-900 tracking-tight tabular-nums">{filas.length}</span>
          <span className="text-xs font-semibold text-emerald-600">{alDia.length} al día</span>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">
          {filas.length === 0
            ? 'Sin movimiento en este entorno'
            : `${((alDia.length / filas.length) * 100).toFixed(0)}% sin atrasos`}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-neutral-200/90 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cartera en Riesgo</span>
          <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-rose-700 tracking-tight tabular-nums">
            {dineroCorto(saldoEnRiesgo)}
          </span>
          <span className="text-xs font-semibold text-rose-600">({enRiesgo.length})</span>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">Más de 15 días de atraso</div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-neutral-200/90 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Facturación Prom.</span>
          <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          {media === null ? (
            <span className="text-2xl font-bold text-neutral-400 tracking-tight">—</span>
          ) : (
            <span
              className={`text-2xl font-bold tracking-tight tabular-nums ${
                media >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {media >= 0 ? `+${media.toFixed(1)}%` : `${media.toFixed(1)}%`}
            </span>
          )}
          <span className="text-xs text-neutral-500">último mes</span>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">
          {media === null
            ? 'Sin meses comparables todavía'
            : `Media de ${conVariacion.length} de ${filas.length} ${P.entidades}`}
        </div>
      </div>
    </div>
  );
}
