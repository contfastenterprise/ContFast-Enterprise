'use client';

/**
 * Lote 295: el pago de una nomina pagada, en su detalle. Fecha, de donde salio
 * (banco y referencia, o la caja), el importe, quien lo registro y su asiento
 * (el mismo visor que el devengo, lote 293).
 *
 * Solo pinta. Los datos salen de `GET /api/v1/hr/payroll/[id]/pay`
 * (`{ data: { pago, hayTabla } }`); el principal los pide al abrir el detalle
 * de una nomina `paid` y los pasa aqui.
 */
import { Wallet } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { NOMBRE_DEL_METODO, type MetodoDePago } from '@/services/nomina/pagoDeNomina';
import { AsientoDeLaNomina, type AsientoParaVer } from './AsientoDeLaNomina';

export interface PagoParaVer {
  id: string;
  fecha: string;
  metodo: MetodoDePago;
  referencia: string | null;
  monto: number;
  banco: string | null;
  autor: string | null;
  asiento: AsientoParaVer | null;
}

const pesos = (n: number) => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PagoDeLaNomina({ status, pago }: { status: string; pago: PagoParaVer | null }) {
  if (!pago) {
    // Una pagada sin pago registrado no sale de este sistema: se dice, no se inventa.
    if (status === 'paid') {
      return (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Esta nómina figura como pagada, pero su pago no se registró desde aquí.
        </p>
      );
    }
    return null;
  }
  const origen = pago.metodo === 'cash'
    ? 'Caja'
    : `${NOMBRE_DEL_METODO[pago.metodo]}${pago.banco ? ` desde ${pago.banco}` : ''}${pago.referencia ? ` · ${pago.referencia}` : ''}`;
  return (
    <section aria-label="Pago de la nómina" className="space-y-2">
      <div className="flex flex-col gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          <span className="font-bold">Pagada el {formatDateDisplay(pago.fecha)}</span>
          <span>{origen}</span>
        </div>
        <div>
          <span className="font-mono font-bold">{pesos(pago.monto)}</span>
          {pago.autor && <span className="text-emerald-800"> · registró {pago.autor}</span>}
        </div>
      </div>
      <AsientoDeLaNomina status="paid" asiento={pago.asiento} motivoRechazo={null} />
    </section>
  );
}
