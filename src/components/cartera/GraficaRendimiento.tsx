'use client';

import React, { useState } from 'react';
import type { PuntoMensual } from '@/repositories/carteraRepository';

/**
 * La linea de los ultimos seis meses, dentro de la fila de la tabla.
 *
 * QUE ENSEÑA, DICHO SIN ADORNOS
 * -----------------------------
 * Lo FACTURADO cada mes y su variacion contra el mes anterior. En el proyecto
 * del que sale esta pantalla era un "rendimiento" que no era nada -- un indice
 * inventado en los datos de ejemplo. Aqui es un numero que se puede señalar en
 * la base, y la etiqueta lo dice para que nadie tenga que adivinarlo.
 *
 * LOS MESES SIN MOVIMIENTO VALEN CERO Y SE PINTAN
 * -----------------------------------------------
 * El repositorio devuelve los seis SIEMPRE. Si solo se dibujaran los meses con
 * datos, un mes sin facturar se leeria como una caida suave entre dos puntos en
 * vez de como lo que fue: un mes en blanco.
 *
 * Y LA VARIACION PUEDE NO EXISTIR
 * -------------------------------
 * Contra un mes de cero no hay porcentaje que calcular -- no es "infinito por
 * ciento", es que no hay comparacion. Llega como `null` y se enseña como raya,
 * no como 0%.
 */
export function GraficaRendimiento({ datos }: { datos: PuntoMensual[] }) {
  const [encima, setEncima] = useState<number | null>(null);

  if (!datos || datos.length === 0) {
    return <span className="text-xs text-neutral-400">Sin datos</span>;
  }

  const ancho = 140;
  const alto = 38;
  const padX = 8;
  const padY = 6;
  const anchoUtil = ancho - padX * 2;
  const altoUtil = alto - padY * 2;

  const montos = datos.map((d) => d.monto);
  const max = Math.max(...montos, 1);
  const min = Math.min(...montos, 0);
  const rango = max - min || 1;

  const puntos = datos.map((d, i) => ({
    ...d,
    i,
    x: padX + (i / Math.max(datos.length - 1, 1)) * anchoUtil,
    y: padY + altoUtil - ((d.monto - min) / rango) * altoUtil,
  }));

  const trazo = puntos.reduce(
    (acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    ''
  );
  const base = padY + altoUtil;
  const area = `${trazo} L ${puntos[puntos.length - 1].x.toFixed(1)} ${base} L ${puntos[0].x.toFixed(1)} ${base} Z`;

  const ultima = datos[datos.length - 1].variacion;
  const sube = ultima !== null && ultima >= 0;
  const colorLinea = ultima === null ? '#94a3b8' : sube ? '#10b981' : '#ef4444';
  const colorArea = ultima === null ? 'rgba(148,163,184,0.12)' : sube ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';

  const mesCorto = (mes: string) => {
    const NOMBRES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const n = Number(mes.slice(5, 7));
    return NOMBRES[n - 1] ?? mes;
  };

  const dinero = (n: number) =>
    n.toLocaleString('es-DO', { maximumFractionDigits: 0 });

  return (
    <div className="relative inline-flex items-center group py-1">
      <svg
        width={ancho}
        height={alto}
        className="overflow-visible cursor-crosshair"
        onMouseLeave={() => setEncima(null)}
        role="img"
        aria-label={`Facturación de los últimos ${datos.length} meses`}
      >
        <line x1={padX} y1={base} x2={ancho - padX} y2={base} stroke="#e2e8f0" strokeDasharray="2,2" strokeWidth="1" />
        <path d={area} fill={colorArea} />
        <path d={trazo} fill="none" stroke={colorLinea} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {puntos.map((p) => {
          const activo = encima === p.i;
          return (
            <g key={p.mes} onMouseEnter={() => setEncima(p.i)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={activo ? 4.5 : 2.5}
                fill={p.monto > 0 ? colorLinea : '#cbd5e1'}
                stroke="#ffffff"
                strokeWidth={activo ? 2 : 1}
                className="transition-all duration-150"
              />
              <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
            </g>
          );
        })}
      </svg>

      <div className="ml-2 text-right">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
            ultima === null
              ? 'bg-neutral-100 text-neutral-500'
              : sube
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
          // Una raya NO es 0%: es que el mes anterior fue cero y no hay contra
          // que comparar. Se dice al pasar el raton, no se disfraza de dato.
          title={
            ultima === null
              ? 'Sin comparación: el mes anterior no tuvo movimiento'
              : 'Variación contra el mes anterior'
          }
        >
          {ultima === null ? '—' : ultima >= 0 ? `+${ultima.toFixed(1)}%` : `${ultima.toFixed(1)}%`}
        </span>
      </div>

      {encima !== null && (
        <div
          className="absolute z-30 bottom-full mb-1 pointer-events-none whitespace-nowrap bg-neutral-900 text-white text-[11px] rounded-md px-2 py-1 shadow-lg border border-neutral-800"
          style={{ left: `${puntos[encima].x + 8}px` }}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-neutral-400">{mesCorto(puntos[encima].mes)}:</span>
            <span className="font-bold">RD$ {dinero(puntos[encima].monto)}</span>
          </div>
          <div className="text-[10px] text-neutral-300">
            {puntos[encima].variacion === null
              ? 'Sin comparación con el mes anterior'
              : `${puntos[encima].variacion! >= 0 ? '+' : ''}${puntos[encima].variacion!.toFixed(1)}% vs. mes anterior`}
          </div>
        </div>
      )}
    </div>
  );
}
