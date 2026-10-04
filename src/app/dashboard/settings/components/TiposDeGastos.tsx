/**
 * Configuracion > Tipos de Gastos: la lista (movil y escritorio).
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { RefreshCw, Layers, Plus, Trash2, Pencil } from 'lucide-react';
import type { TiposDeGasto } from '../hooks/useTiposDeGasto';
import { esTipoEstandar } from '../ajustes';

import { Button, IconButton } from '@/components/ui/button';
export function TiposDeGastos({ g }: { g: TiposDeGasto }) {
  return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-bold text-[#003366]">Administración de Tipos de Gastos</h3>
              </div>
              <Button
                type="button"
                onClick={() => g.handleOpenTypeModal()}
                className="flex">
                <Plus className="w-4 h-4" /> Crear Tipo de Gasto
              </Button>
            </div>
            <div className="p-4">
              {g.loadingExpenseTypes ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                </div>
              ) : g.expenseTypes.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No hay tipos de gastos registrados.
                </div>
              ) : (
                <>
                  {/* Mobile View */}
                  <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
                    {g.expenseTypes.map((type) => {
                      const isStandard = esTipoEstandar(type.code);
                      return (
                        <div key={type.id} className="flex flex-col p-4 gap-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold text-slate-500">Cód. {type.code}</span>
                              <span className="font-semibold text-sm text-slate-800">{type.name}</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              type.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-slate-50 text-slate-600 border border-slate-100'
                            }`}>
                              {type.status === 'active' ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          
                          <div className="flex justify-end gap-2 border-t border-slate-50 pt-2 mt-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => g.handleOpenTypeModal(type)}
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => g.handleDeleteType(type)}
                            >
                              <Trash2 className="w-3 h-3" /> {isStandard ? 'Desactivar' : 'Eliminar'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5">Código</th>
                          <th className="px-4 py-2.5">Nombre</th>
                          <th className="px-4 py-2.5">Estado</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {g.expenseTypes.map((type) => {
                          const isStandard = esTipoEstandar(type.code);
                          return (
                            <tr key={type.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{type.code}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-800">{type.name}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  type.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-slate-50 text-slate-600 border border-slate-100'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${type.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {type.status === 'active' ? 'Activo' : 'Inactivo'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right space-x-2">
                                <IconButton
                                  type="button"
                                  aria-label="Editar tipo de gasto"
                                  className="hover:text-[#003366] hover:bg-[#003366]/10"
                                  onClick={() => g.handleOpenTypeModal(type)}
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </IconButton>
                                <IconButton
                                  type="button"
                                  aria-label={isStandard ? 'Desactivar' : 'Eliminar'}
                                  className="hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => g.handleDeleteType(type)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </IconButton>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
  );
}
