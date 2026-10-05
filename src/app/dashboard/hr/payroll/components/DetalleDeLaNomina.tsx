'use client';

/**
 * Lote 294: una nomina abierta -- su cabecera, sus acciones, el aviso del ISR, el asiento
 * (lote 293) y los volantes --, movida tal cual desde `page.tsx`.
 */
import { RefreshCw } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { etiquetaDelEstado } from '@/services/nomina/estadoDeNomina';
import { AsientoDeLaNomina } from './AsientoDeLaNomina';
import { PagoDeLaNomina } from './PagoDeLaNomina';
import type { EstadoNominas } from '../hooks/useNominas';
import { AccionesDeLaNomina } from './AccionesDeLaNomina';
import { VolantesDeLaNomina } from './VolantesDeLaNomina';

export function DetalleDeLaNomina({ h }: { h: EstadoNominas }) {
  const { selectedPayroll, loadingDetails, avisoIsr, asiento, motivoRechazo, pago } = h;
  //  Solo se pinta con una nomina elegida (la pagina lo decide); esto lo dice al compilador.
  if (!selectedPayroll) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              Nómina Período: {formatDateDisplay(selectedPayroll.periodStart)} - {formatDateDisplay(selectedPayroll.periodEnd)}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Estado: <span className="font-semibold text-[#003366]">{etiquetaDelEstado(selectedPayroll.status)}</span> | Pago: {formatDateDisplay(selectedPayroll.paymentDate)}
            </p>
          </div>
          <AccionesDeLaNomina h={h} />
        </div>

        {avisoIsr && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {avisoIsr}
          </p>
        )}

        {!loadingDetails && (
          <AsientoDeLaNomina status={selectedPayroll.status} asiento={asiento} motivoRechazo={motivoRechazo} />
        )}

        {/* Lote 295: el pago y su asiento, en una nomina pagada. */}
        {!loadingDetails && <PagoDeLaNomina status={selectedPayroll.status} pago={pago} />}

        {loadingDetails ? (
          <div className="flex h-[20vh] items-center justify-center">
            <RefreshCw className="h-7 w-7 animate-spin text-[#003366]" />
          </div>
        ) : (
          <VolantesDeLaNomina h={h} />
        )}
      </div>
    </div>
  );
}
