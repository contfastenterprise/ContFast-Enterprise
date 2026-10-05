'use client';

/**
 * Lote 294: el historial de nominas (cargando, vacio, o la lista con su paginacion), movido
 * tal cual desde `page.tsx`. Cada fila lleva "Ver" y, si la regla lo permite, "Eliminar".
 */
import { Banknote, RefreshCw, Trash2, Eye } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { Pagination } from '@/components/ui/pagination';
import { Button, IconButton } from '@/components/ui/button';
import { accionesDeNomina } from '@/services/nomina/estadoDeNomina';
import type { EstadoNominas } from '../hooks/useNominas';

export function ListaDeNominas({ h }: { h: EstadoNominas }) {
  const { payrolls, loading, page, setPage, itemsPerPage, totalPages, pagedPayrolls, handleSelectPayroll, handleDelete } = h;

  return (
    loading ? (
      <div className="flex h-[30vh] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[#003366]" />
      </div>
    ) : payrolls.length === 0 ? (
      <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl bg-white p-8">
        <Banknote className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-sm font-semibold text-slate-800">No hay nóminas registradas</h3>
        <p className="mt-1 text-xs text-slate-500">Comienza generando un nuevo período de nómina.</p>
      </div>
    ) : (
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <>
          {/* Mobile View */}
          <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
            {pagedPayrolls.map((pr) => (
              <div key={pr.id} className="flex flex-col p-4 hover:bg-slate-50 transition-colors gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-slate-800">
                      Desde {formatDateDisplay(pr.periodStart)}
                    </span>
                    <span className="font-semibold text-xs text-slate-800">
                      Hasta {formatDateDisplay(pr.periodEnd)}
                    </span>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pr.status === 'approved' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : pr.status === 'calculated' 
                      ? 'bg-blue-50 text-[#003366] border border-blue-200' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                    {pr.status === 'approved' ? 'Aprobada' : pr.status === 'calculated' ? 'Calculada' : pr.status}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha de Pago:</span>
                    <span className="font-mono font-bold text-[#003366]">{formatDateDisplay(pr.paymentDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Creación:</span>
                    <span className="text-slate-500">{formatDateDisplay(pr.createdAt)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="bg-slate-100 hover:text-[#003366] hover:bg-[#003366]/10"
                    onClick={() => handleSelectPayroll(pr)}
                    title="Ver Volantes"
                  >
                    <Eye className="h-4 w-4" /> Ver
                  </Button>
                  {accionesDeNomina(pr.status, 0).eliminar && (
                    <IconButton
                      type="button"
                      aria-label="Eliminar nómina"
                      className="bg-slate-100 hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDelete(pr.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Período</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fecha de Pago</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fecha Creación</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPayrolls.map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-2.5 align-middle text-xs font-semibold text-slate-700">
                      Desde {formatDateDisplay(pr.periodStart)} Hasta {formatDateDisplay(pr.periodEnd)}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs font-mono font-bold text-[#003366]">{formatDateDisplay(pr.paymentDate)}</td>
                    <td className="px-4 py-2.5 align-middle text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pr.status === 'approved' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : pr.status === 'calculated' 
                          ? 'bg-blue-50 text-[#003366] border border-blue-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                        {pr.status === 'approved' ? 'Aprobada' : pr.status === 'calculated' ? 'Calculada' : pr.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs text-slate-500">{formatDateDisplay(pr.createdAt)}</td>
                    <td className="px-4 py-2.5 align-middle text-right">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="hover:text-[#003366] hover:bg-[#003366]/10"
                          onClick={() => handleSelectPayroll(pr)}
                          title="Ver Volantes"
                        >
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </Button>
                        {accionesDeNomina(pr.status, 0).eliminar && (
                          <IconButton
                            type="button"
                            aria-label="Eliminar nómina"
                            className="hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(pr.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginacion: el componente comun (P3-45, lote 128) */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={payrolls.length}
            pageSize={itemsPerPage}
            onPageChange={setPage}
            itemLabel="nóminas"
            hideControlsWhenSinglePage
          />
        </>
      </div>
    )
  );
}
