'use client';

/**
 * La ventana del cierre: el resultado del arqueo (lote 172).
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 */
import { CheckCircle2, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { fmt } from '../caja';
import type { Caja } from '../hooks/useCaja';

export function ModalCierre({ c }: { c: Caja }) {
  //  Lote 279: la ventana comun (`Modal`). El fondo no cerraba y no tenia X: la unica salida era
  //  "Volver al Inicio", y esa es su `onClose` (la X y Escape hacen lo mismo que ese boton).
  return (
    <>
      <Modal
        isOpen={c.showSuccessModal}
        onClose={c.handleSuccessClose}
        cerrarAlPulsarFuera={false}
        maxWidth="sm"
        icono={<CheckCircle2 />}
        title="Cierre Exitoso"
      >
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
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
                <Button
                  type="button"
                  variant="documento"
                  size="sm"
                  onClick={() => window.open(`/api/v1/cash/sessions/${c.closedSessionId}/print`, '_blank')}
                  className="flex-1"
                >
                  <Printer className="w-3 h-3" /> Imprimir Arqueo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={c.handleSuccessClose}
                  className="flex-1"
                >
                  Volver al Inicio
                </Button>
              </div>
            </div>
      </Modal>
    </>
  );
}
