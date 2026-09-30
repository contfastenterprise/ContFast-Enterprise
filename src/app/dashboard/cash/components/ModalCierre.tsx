'use client';

/**
 * La ventana del cierre: el resultado del arqueo (lote 172).
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 */
import { CheckCircle2, Printer } from 'lucide-react';
//  Lote 230: `m` y no `motion`; el `LazyMotion` lo pone la pagina.
import { m, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { fmt } from '../caja';
import type { Caja } from '../hooks/useCaja';

export function ModalCierre({ c }: { c: Caja }) {
  return (
    <>
      <AnimatePresence>
        {c.showSuccessModal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <m.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl text-center border-t-4 border-[#c5a059]"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-[#001e40] mb-2">Cierre Exitoso</h2>
              <p className="text-slate-500 text-xs mb-4">
                El arqueo ha sido procesado y el turno ha sido cerrado satisfactoriamente. La terminal está lista para el siguiente turno.
              </p>

              {/* Lote 172: el resultado del arqueo. Es AQUI donde se ve el
                  esperado y la diferencia -- ya no se puede retocar el conteo. */}
              {c.resultadoArqueo && (
                <div className="text-left border border-slate-200 rounded-lg p-3 mb-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Esperado en sistema</span>
                    <span className="font-mono font-bold">{fmt(c.resultadoArqueo.expectedBalance)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Contado</span>
                    <span className="font-mono font-bold">{fmt(c.resultadoArqueo.actualBalance)}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700">Diferencia</span>
                    <span className={clsx('font-mono font-bold',
                      parseFloat(c.resultadoArqueo.difference) === 0 ? 'text-emerald-700'
                        : parseFloat(c.resultadoArqueo.difference) > 0 ? 'text-blue-700' : 'text-red-700')}>
                      {fmt(c.resultadoArqueo.difference)}
                    </span>
                  </div>
                  {parseFloat(c.resultadoArqueo.difference) !== 0 && (
                    <p className="text-[10px] text-amber-700 leading-snug pt-1">
                      Hay diferencia: el cierre queda registrado y pendiente de aprobación de un supervisor.
                    </p>
                  )}
                  {/* Lo cobrado por transferencia o cheque en esta sesion: no
                      es efectivo y no cuadra la caja, pero es dinero de este
                      turno del que hay que responder. */}
                  {!!c.resultadoArqueo.totalTransferencias && parseFloat(c.resultadoArqueo.totalTransferencias) !== 0 && (
                    <>
                      <div className="h-px bg-slate-200" />
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Cobrado por transferencia / cheque</span>
                        <span className="font-mono font-bold text-slate-700">{fmt(c.resultadoArqueo.totalTransferencias)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        No entra en el conteo de efectivo: ese dinero no está en la caja. Queda en el arqueo con su constancia.
                      </p>
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => window.open(`/api/v1/cash/sessions/${c.closedSessionId}/print`, '_blank')}
                  className="flex-1 bg-white border border-slate-300 text-slate-700 h-8 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-3 h-3" /> Imprimir Arqueo
                </button>
                <button
                  onClick={c.handleSuccessClose}
                  className="flex-1 bg-[#001e40] text-white h-8 rounded-lg font-bold text-xs hover:bg-[#003366] transition-colors"
                >
                  Volver al Inicio
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
