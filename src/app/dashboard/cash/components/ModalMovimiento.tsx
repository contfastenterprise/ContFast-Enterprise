'use client';

/**
 * La ventana de entrada o salida de efectivo.
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 */
import { Plus, Minus, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import clsx from 'clsx';
import type { Caja } from '../hooks/useCaja';
import { Button } from '@/components/ui/button';

export function ModalMovimiento({ c }: { c: Caja }) {
  //  Lote 279: la ventana comun (`Modal`). El fondo no cerraba (formulario), y mientras se
  //  registra (`submitting`) no se cierra.
  return (
    <>
      <Modal
        isOpen={c.showMoveModal}
        onClose={() => c.setShowMoveModal(false)}
        bloqueada={c.submitting}
        cerrarAlPulsarFuera={false}
        maxWidth="md"
        sinRelleno
        icono={c.moveType === 'cash_in' ? <Plus /> : <Minus />}
        title={c.moveType === 'cash_in' ? 'Entrada de Efectivo' : 'Salida de Efectivo'}
      >
              <form onSubmit={c.handleAddMovement} className="p-4 space-y-4">
                <div className="flex gap-2">
                  {(['cash_in', 'cash_out'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => c.setMoveType(t)}
                      className={clsx(
                        'flex-1 h-8 text-xs font-bold border transition rounded-lg',
                        c.moveType === t
                          ? t === 'cash_in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                      )}
                    >
                      {t === 'cash_in' ? '↑ Entrada' : '↓ Salida'}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label htmlFor="caja-movimiento-monto" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Monto (RD$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-[10px]">RD$</span>
                    <input
                      id="caja-movimiento-monto"
                      type="number"
                      value={c.moveAmount}
                      onChange={(e) => c.setMoveAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-1.5 font-mono text-xs font-bold text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="caja-movimiento-concepto" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Descripción / Concepto</label>
                  <input
                    id="caja-movimiento-concepto"
                    type="text"
                    value={c.moveDescription}
                    onChange={(e) => c.setMoveDescription(e.target.value)}
                    placeholder="Ej: Pago de mensajería, fondo adicional..."
                    className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-xs transition-colors"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <Button variant="secondary"
                    type="button"
                    onClick={() => c.setShowMoveModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant={c.moveType === 'cash_in' ? 'success' : 'destructive'}
                    disabled={c.submitting}
                  >
                    {c.submitting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    Registrar {c.moveType === 'cash_in' ? 'Entrada' : 'Salida'}
                  </Button>
                </div>
            </form>
      </Modal>
    </>
  );
}
