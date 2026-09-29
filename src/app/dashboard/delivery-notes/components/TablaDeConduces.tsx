'use client';

/**
 * La tabla de conduces con su columna de acciones. Salio de `page.tsx` al
 * partirla (lote 226), con el mismo marcado. Solo pinta: cargar, aprobar,
 * anular e imprimir siguen en la pagina, que es quien recarga la lista.
 */
import { Check, Eye, Printer, ShieldAlert, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { formatDateDisplay } from '@/utils/fechasLocales';

export function TablaDeConduces({
  notes,
  onVer,
  onImprimir,
  onAprobar,
  onAnular,
}: {
  notes: any[];
  onVer: (id: string) => void;
  onImprimir: (id: string) => void;
  onAprobar: (id: string) => void;
  onAnular: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-slate-50/80 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Número</th>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha Entrega</th>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chofer</th>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Placa</th>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
            <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {notes.map((note) => (
            <tr key={note.id} className="hover:bg-[#C5A059]/5 transition-colors group">
              <td className="px-4 py-2.5 align-middle text-xs font-mono font-bold text-slate-800">
                {note.deliveryNumber}
              </td>
              <td className="px-4 py-2.5 align-middle text-xs text-slate-600">
                {formatDateDisplay(note.deliveryDate)}
              </td>
              <td className="px-4 py-2.5 align-middle text-xs text-slate-700 font-semibold">
                {note.driverName || 'N/A'}
              </td>
              <td className="px-4 py-2.5 align-middle text-xs font-mono text-slate-500">
                {note.vehiclePlate || 'N/A'}
              </td>
              <td className="px-4 py-2.5 align-middle text-center">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded border",
                    note.status === 'approved' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                    note.status === 'draft' && "bg-amber-50 text-amber-700 border-amber-100",
                    note.status === 'voided' && "bg-rose-50 text-rose-700 border-rose-100"
                  )}
                >
                  {note.status === 'approved' ? 'Despachado' : note.status === 'draft' ? 'Borrador' : 'Anulado'}
                </span>
              </td>
              <td className="px-4 py-2.5 align-middle text-right">
                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onVer(note.id)}
                    className="p-1.5 hover:bg-slate-50 rounded text-slate-600 transition-colors"
                    title="Ver Conduce"
                    aria-label={`Ver conduce ${note.deliveryNumber}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onImprimir(note.id)}
                    className="p-1.5 hover:bg-slate-50 rounded text-slate-600 transition-colors"
                    title="Imprimir Conduce"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  {note.status === 'draft' && (
                    <>
                      <button
                        onClick={() => onAprobar(note.id)}
                        className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600 transition-colors"
                        title="Aprobar y Despachar Inventario"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onAnular(note.id)}
                        className="p-1.5 hover:bg-rose-50 rounded text-rose-600 transition-colors"
                        title="Eliminar Borrador"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {note.status === 'approved' && (
                    <button
                      onClick={() => onAnular(note.id)}
                      className="p-1.5 hover:bg-rose-50 rounded text-rose-600 transition-colors"
                      title="Anular y Revertir Inventario"
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
