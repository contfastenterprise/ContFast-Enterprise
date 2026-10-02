/**
 * Crear o editar un tipo de gasto.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import type { TiposDeGasto } from '../hooks/useTiposDeGasto';

export function ModalTipoDeGasto({ g }: { g: TiposDeGasto }) {
  return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-[#001733] border-b border-[#003366] px-4 py-3 flex items-center justify-between text-white">
                <h3 className="font-bold">{g.editingType ? 'Editar Tipo de Gasto' : 'Crear Tipo de Gasto'}</h3>
                <button type="button" aria-label="Cerrar" onClick={() => g.setShowTypeModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={g.handleSaveType} className="p-4 space-y-4">
                <div className="space-y-1">
                  <label htmlFor="ajuste-codigo-dgii" className="block text-xs font-bold text-slate-700 uppercase">Código DGII</label>
                  <input id="ajuste-codigo-dgii"
                    type="text"
                    value={g.typeCode}
                    onChange={e => g.setTypeCode(e.target.value)}
                    disabled={!!g.editingType}
                    maxLength={2}
                    placeholder="Ej. 11"
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 disabled:opacity-60 outline-none"
                  />
                  {!g.editingType && <p className="text-[10px] text-slate-400">Debe tener exactamente 2 dígitos numéricos.</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor="ajuste-nombre" className="block text-xs font-bold text-slate-700 uppercase">Nombre</label>
                  <input id="ajuste-nombre"
                    type="text"
                    value={g.typeName}
                    onChange={e => g.setTypeName(e.target.value)}
                    placeholder="Ej. Gastos Especiales"
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 outline-none"
                  />
                </div>
                {g.editingType && (
                  <div className="space-y-1">
                    <label htmlFor="ajuste-estado" className="block text-xs font-bold text-slate-700 uppercase">Estado</label>
                    <select id="ajuste-estado"
                      value={g.typeStatus}
                      onChange={e => g.setTypeStatus(e.target.value === 'inactive' ? 'inactive' : 'active')}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 outline-none"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => g.setShowTypeModal(false)}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={g.savingType}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    {g.savingType ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
  );
}
