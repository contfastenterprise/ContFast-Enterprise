'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, AlertOctagon } from 'lucide-react';
import { CONFIG_RIESGO, type NivelRiesgo } from '@/services/cartera/riesgo';

/**
 * El icono de cada nivel de riesgo.
 *
 * Vive aqui porque lo usan la LEYENDA y la TABLA, y son el mismo dibujo: si la
 * tabla enseña un icono y la leyenda otro, la leyenda deja de explicar la
 * tabla, que es su unico trabajo.
 */
const DIBUJO: Record<NivelRiesgo, React.ComponentType<{ className?: string }>> = {
  bajo: ShieldCheck,
  medio: AlertTriangle,
  alto: ShieldAlert,
  critico: AlertOctagon,
};

const COLOR: Record<NivelRiesgo, string> = {
  bajo: 'text-emerald-600',
  medio: 'text-amber-600',
  alto: 'text-orange-600',
  critico: 'text-rose-600',
};

/**
 * Un icono solo NO se explica: sin texto al lado, quien no se sepa la leyenda de
 * memoria no sabe si el escudo es bueno o malo. Por eso lleva siempre su
 * nombre y su criterio en el `title` -- para el raton -- y en `aria-label`,
 * para quien no ve el dibujo en absoluto.
 */
export function IconoRiesgo({
  nivel,
  className = 'w-4 h-4',
}: {
  nivel: NivelRiesgo;
  className?: string;
}) {
  const Dibujo = DIBUJO[nivel];
  const cfg = CONFIG_RIESGO[nivel];
  const texto = `${cfg.etiqueta} — ${cfg.criterio}`;

  return (
    <span role="img" aria-label={texto} title={texto} className="inline-flex">
      <Dibujo className={`${className} ${COLOR[nivel]} shrink-0`} />
    </span>
  );
}
