'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { SumaPorTramo, Tramo } from '@/services/cartera/vencimiento';
import { dinero } from './tipos';

/**
 * Lote 304: la ANTIGUEDAD de los saldos, que la pantalla "Antigüedad de Saldos" no enseñaba.
 *
 * Tenia niveles de riesgo por cliente (1-15, 16-45, +45 dias del documento MAS atrasado) y ningun
 * tramo, mientras Cuentas por Cobrar, Cuentas por Pagar y los estados de cuenta reparten el saldo
 * por documento en 1-30, 31-60, 61-90 y +90. Por eso "no coincidian": no se podia comparar una
 * cifra con otra. Los tramos salen de `tramoDeAtraso` (`vencimiento.ts`), la misma funcion que usan
 * esas pantallas, documento a documento.
 */
const TRAMOS_VISIBLES: { tramo: Tramo; etiqueta: string; clases: string }[] = [
  { tramo: 'por-vencer', etiqueta: 'Por vencer', clases: 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900' },
  { tramo: '1-30', etiqueta: '1 a 30 días', clases: 'bg-amber-50/70 border-amber-200/80 text-amber-900' },
  { tramo: '31-60', etiqueta: '31 a 60 días', clases: 'bg-orange-50/70 border-orange-200/80 text-orange-900' },
  { tramo: '61-90', etiqueta: '61 a 90 días', clases: 'bg-rose-50/70 border-rose-200/80 text-rose-900' },
  { tramo: '90+', etiqueta: 'Más de 90 días', clases: 'bg-rose-100/70 border-rose-300/80 text-rose-950' },
];

export function TramosDeAntiguedad({ tramos, total }: { tramos: SumaPorTramo; total: number }) {
  return (
    <section
      className="mb-4 bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs"
      data-tramos-antiguedad
      aria-label="Saldo por antigüedad"
    >
      <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-neutral-100">
        <CalendarClock className="w-4 h-4 text-neutral-700" aria-hidden="true" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
          Saldo por antigüedad
        </h2>
        <span className="text-[11px] text-neutral-500">días de atraso desde el vencimiento</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {TRAMOS_VISIBLES.map((t) => (
          <div key={t.tramo} className={`p-3 border rounded-xl ${t.clases}`} data-tramo={t.tramo}>
            <span className="text-[11px] font-semibold block">{t.etiqueta}</span>
            <span className="text-sm font-bold tabular-nums">{dinero(tramos[t.tramo])}</span>
            <span className="text-[10px] block mt-0.5 opacity-80 tabular-nums">
              {total > 0 ? `${((tramos[t.tramo] / total) * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
        ))}
        <div className="p-3 border rounded-xl bg-neutral-50 border-neutral-200 text-neutral-900" data-tramo="total">
          <span className="text-[11px] font-semibold block">Total</span>
          <span className="text-sm font-bold tabular-nums">{dinero(total)}</span>
          <span className="text-[10px] block mt-0.5 opacity-80">100%</span>
        </div>
      </div>
    </section>
  );
}
