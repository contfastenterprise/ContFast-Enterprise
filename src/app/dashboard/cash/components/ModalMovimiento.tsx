'use client';

/**
 * La ventana de entrada o salida de efectivo.
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 */
import { Plus, Minus, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { Caja } from '../hooks/useCaja';

export function ModalMovimiento({ c }: { c: Caja }) {
  return (
    <>
      <AnimatePresence>
        {c.showMoveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
                <div className="flex items-center gap-2">
                  {c.moveType === 'cash_in'
                    ? <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-200"><Plus className="w-4 h-4 text-emerald-600" /></div>
                    : <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center border border-red-200"><Minus className="w-4 h-4 text-red-600" /></div>
                  }
                  <h3 className="text-sm font-bold text-slate-800">
                    {c.moveType === 'cash_in' ? 'Entrada de Efectivo' : 'Salida de Efectivo'}
                  </h3>
                </div>
                <button onClick={() => c.setShowMoveModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

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
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Monto (RD$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-[10px]">RD$</span>
                    <input
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
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Descripción / Concepto</label>
                  <input
                    type="text"
                    value={c.moveDescription}
                    onChange={(e) => c.setMoveDescription(e.target.value)}
                    placeholder="Ej: Pago de mensajería, fondo adicional..."
                    className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-xs transition-colors"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => c.setShowMoveModal(false)}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={c.submitting}
                    className={clsx(
                      'flex items-center justify-center gap-2 px-3 py-1.5 font-bold rounded-lg text-xs transition-colors text-white',
                      c.moveType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
                      c.submitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {c.submitting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    Registrar {c.moveType === 'cash_in' ? 'Entrada' : 'Salida'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
