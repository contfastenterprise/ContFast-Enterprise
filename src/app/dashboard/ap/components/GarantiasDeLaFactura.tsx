'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import {
  resumirGarantias,
  type ChequeEnGarantia,
  type ResumenGarantias,
} from '@/services/cxp/garantiasDeFactura';

/**
 * Lote 161: los cheques en garantia pendientes DE ESTA factura, dentro del
 * dialogo de pago. Ver `services/cxp/garantiasDeFactura.ts` para el porque.
 *
 * Se piden al servidor por factura (`apId` + `pending_guarantee`) y no se
 * sacan de la lista de pendientes que ya tiene la pagina: esa viene cortada a
 * 100 filas, y una lista cortada que alimenta una decision calla lo que no
 * trae (el defecto que barrio el lote 135).
 */

export type EstadoGarantias =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'listo'; resumen: ResumenGarantias };

interface Props {
  apId: string;
  saldoFactura: number;
  bancos: { id: string; bankName: string; accountNumber: string }[];
  onEstado: (e: EstadoGarantias) => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(v || 0);

export default function GarantiasDeLaFactura({ apId, saldoFactura, bancos, onEstado }: Props) {
  const [cheques, setCheques] = useState<ChequeEnGarantia[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setCheques(null);
    setFallo(false);
    onEstado({ estado: 'cargando' });

    const query = new URLSearchParams({
      payments: 'true',
      apId,
      status: 'pending_guarantee',
      pageSize: '100',
    });
    fetch(`/api/v1/ap?${query.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return;
        const items: ChequeEnGarantia[] = json?.data?.items;
        // Si el servidor dice que hay mas de los que llegaron, la suma no vale:
        // mejor "no se pudo comprobar" que un total que parece completo.
        if (!json?.success || !Array.isArray(items) || Number(json.data.total) > items.length) {
          setFallo(true);
          onEstado({ estado: 'error' });
          return;
        }
        setCheques(items);
        onEstado({ estado: 'listo', resumen: resumirGarantias(items, saldoFactura) });
      })
      .catch(() => {
        if (!vigente) return;
        setFallo(true);
        onEstado({ estado: 'error' });
      });

    return () => { vigente = false; };
    // `onEstado` es el setState del padre: estable, no vuelve a disparar esto.
  }, [apId, saldoFactura, onEstado]);

  if (fallo) {
    return (
      <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
        <span>No se pudo comprobar si esta factura tiene cheques en garantía pendientes. Revise la pestaña de garantías antes de pagar.</span>
      </div>
    );
  }

  if (cheques === null) {
    return (
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comprobando cheques en garantía…
      </div>
    );
  }

  if (cheques.length === 0) return null;

  const resumen = resumirGarantias(cheques, saldoFactura);
  const banco = (id?: string | null) => {
    const b = bancos.find((x) => x.id === id);
    return b ? `${b.bankName} - ${b.accountNumber}` : '—';
  };

  return (
    <div className="bg-amber-50 p-4 rounded-xl border border-amber-300 space-y-3">
      <div className="flex items-start gap-2 text-amber-800">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            Esta factura tiene {resumen.cantidad === 1 ? 'un cheque' : `${resumen.cantidad} cheques`} en garantía pendiente{resumen.cantidad === 1 ? '' : 's'} de cobro
          </p>
          <p className="text-[11px] mt-0.5">
            Cuando el banco lo{resumen.cantidad === 1 ? '' : 's'} cobre, se aplicará{resumen.cantidad === 1 ? '' : 'n'} a esta factura. Un pago ahora por encima del saldo sin cubrir se pagaría dos veces.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-amber-900/70 uppercase tracking-wider">
              <th className="py-1 pr-3 font-bold">No. cheque</th>
              <th className="py-1 pr-3 font-bold">Banco</th>
              <th className="py-1 pr-3 font-bold">Emitido</th>
              <th className="py-1 pr-3 font-bold">Fecha de cobro</th>
              <th className="py-1 font-bold text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="text-amber-950">
            {cheques.map((c, i) => (
              <tr key={c.checkId ?? i} className="border-t border-amber-200">
                <td className="py-1 pr-3 font-mono">{c.checkNumber || '—'}</td>
                <td className="py-1 pr-3">{banco(c.checkBankAccountId)}</td>
                <td className="py-1 pr-3">{c.paymentDate ? formatDateDisplay(c.paymentDate) : '—'}</td>
                <td className="py-1 pr-3 font-semibold">{c.dueDate ? formatDateDisplay(c.dueDate) : '—'}</td>
                <td className="py-1 text-right font-mono">{fmt(parseFloat(String(c.amount)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] border-t border-amber-200 pt-2">
        <div><span className="text-amber-900/70">Saldo de la factura:</span> <span className="font-mono">{fmt(saldoFactura)}</span></div>
        <div><span className="text-amber-900/70">Cubierto por cheques:</span> <span className="font-mono">{fmt(resumen.totalCheques)}</span></div>
        <div className="font-bold"><span className="text-amber-900/70 font-normal">Sin cubrir:</span> <span className="font-mono">{fmt(resumen.saldoSinCubrir)}</span></div>
      </div>

      {resumen.cubiertoDeMas && (
        <p className="text-[11px] font-semibold text-rose-700">
          Los cheques pendientes ya suman más que el saldo: esta factura recibió pagos mientras el cheque seguía por cobrar.
        </p>
      )}
    </div>
  );
}
