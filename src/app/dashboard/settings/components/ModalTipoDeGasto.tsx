/**
 * Crear o editar un tipo de gasto.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { CheckCircle2 } from 'lucide-react';
import type { TiposDeGasto } from '../hooks/useTiposDeGasto';

import { Modal } from '@/components/ui/dialog';
import { AccionesDeFormulario } from '@/components/ui/acciones-de-formulario';

export function ModalTipoDeGasto({ g }: { g: TiposDeGasto }) {
  return (
          <Modal
            isOpen={g.showTypeModal}
            onClose={() => g.setShowTypeModal(false)}
            title={g.editingType ? 'Editar Tipo de Gasto' : 'Crear Tipo de Gasto'}
            maxWidth="md"
            cerrarAlPulsarFuera={false}
            bloqueada={g.savingType}
          >
              <form onSubmit={g.handleSaveType} className="space-y-4">
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
                <AccionesDeFormulario
                  textoPrincipal="Guardar"
                  iconoPrincipal={<CheckCircle2 className="w-3.5 h-3.5" />}
                  guardando={g.savingType}
                  alCancelar={() => g.setShowTypeModal(false)}
                />
              </form>
          </Modal>
  );
}
