'use client';

/**
 * Lote 294: la ventana "Generar Nomina de Periodo" (el `Modal` comun, lote 280), movida tal
 * cual desde `page.tsx`.
 */
import { Calendar } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { EstadoNominas } from '../hooks/useNominas';

export function GenerarNomina({ h }: { h: EstadoNominas }) {
  const { showCreateModal, setShowCreateModal, submitting, formData, setFormData, handleCreatePayroll } = h;

  return (
    <Modal
      isOpen={showCreateModal}
      onClose={() => setShowCreateModal(false)}
      title="Generar Nómina de Período"
      icono={<Calendar />}
      maxWidth="md"
      cerrarAlPulsarFuera={false}
      bloqueada={submitting}
    >
          <form onSubmit={handleCreatePayroll} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Frecuencia de la Nómina</label>
              <select
                required
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
              >
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Inicio del Período</label>
              <input
                type="date"
                required
                value={formData.periodStart}
                onChange={e => setFormData({ ...formData, periodStart: e.target.value })}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Fin del Período</label>
              <input
                type="date"
                required
                value={formData.periodEnd}
                onChange={e => setFormData({ ...formData, periodEnd: e.target.value })}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Estimada de Pago</label>
              <input
                type="date"
                required
                value={formData.paymentDate}
                onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
              />
            </div>
            <div className="flex justify-end gap-3.5 pt-2 border-t border-slate-200/60 mt-4">
              <Button variant="secondary"
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex">
                {submitting ? 'Generando...' : 'Generar y Calcular'}
              </Button>
            </div>
          </form>
    </Modal>
  );
}
