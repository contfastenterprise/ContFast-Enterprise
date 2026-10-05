'use client';

/**
 * Lote 293: lo que la nomina dejo en el libro. Tras aprobarla, su asiento de
 * devengo (fecha, cuentas, debe y haber) con el enlace al Libro Diario; si la
 * aprobacion se nego, el motivo, que se queda a la vista (el aviso emergente
 * se va solo, y el motivo dice que hay que hacer).
 */
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';

export interface AsientoParaVer {
  id: string;
  fecha: string;
  descripcion: string | null;
  lineas: { codigo: string; cuenta: string; debe: number; haber: number }[];
  total: number;
}

const importe = (n: number) => (n > 0 ? n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

export function AsientoDeLaNomina({ status, asiento, motivoRechazo }: { status: string; asiento: AsientoParaVer | null; motivoRechazo: string | null }) {
  if (motivoRechazo) {
    return (
      <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
        {motivoRechazo}
      </p>
    );
  }
  if (!asiento) {
    // Una aprobada sin asiento es de antes del lote 293: se dice, no se inventa.
    if (status === 'approved' || status === 'paid') {
      return (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Esta nómina se aprobó sin registrar asiento contable: su devengo lo asienta el contador a mano.
        </p>
      );
    }
    return null;
  }
  return (
    <section aria-label="Asiento contable de la nómina" className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-1 border-b border-slate-200 px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-xs">
          <BookOpen className="h-4 w-4 text-[#003366]" aria-hidden="true" />
          <span className="font-bold text-slate-800">Asiento contable</span>
          <span className="text-slate-500">{formatDateDisplay(asiento.fecha)} · {asiento.descripcion}</span>
        </div>
        <Link href="/dashboard/accounting?tab=journals" className="text-xs font-semibold text-[#003366] underline-offset-2 hover:underline">
          Ver en el Libro Diario
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Cuenta</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Debe</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asiento.lineas.map((l) => (
              <tr key={`${l.codigo}-${l.debe > 0 ? 'd' : 'h'}`}>
                <td className="px-3 py-1.5 text-slate-700"><span className="font-mono">{l.codigo}</span> {l.cuenta}</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-800">{importe(l.debe)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-800">{importe(l.haber)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 font-bold">
            <tr>
              <td className="px-3 py-1.5 text-slate-800">Total</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-800">{importe(asiento.total)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-800">{importe(asiento.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
