'use client';

/**
 * La ventana que ensena una sesion del historico.
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 */
import { Wallet, Printer, X } from 'lucide-react';
//  Lote 230: `m` y no `motion`; el `LazyMotion` lo pone la pagina.
import { m, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { formatDateTimeDisplay } from '@/utils/fechasLocales';
import { fmt } from '../caja';
import type { HistorialCaja } from '../hooks/useHistorialCaja';
import { Button, IconButton } from '@/components/ui/button';

export function ModalVerSesion({ h }: { h: HistorialCaja }) {
  return (
    <>
      <AnimatePresence>
        {h.showViewModal && h.selectedSession && (
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <m.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="bg-[#001e40] p-4 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10">
                  <Wallet className="w-24 h-24 transform translate-x-4 -translate-y-4" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-base font-bold font-display">Detalle de Turno</h3>
                  <p className="text-xs opacity-80 mt-0.5">{h.selectedSession.registerName}</p>
                </div>
                <IconButton type="button" onClick={() => h.setShowViewModal(false)} aria-label="Cerrar el detalle del turno" className="relative z-10 text-white/70 hover:text-white hover:bg-white/10">
                  <X className="w-5 h-5" />
                </IconButton>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-slate-500 font-bold mb-1">Apertura</span>
                    <span className="font-bold text-slate-800">{formatDateTimeDisplay(h.selectedSession.createdAt)}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold mb-1">Cierre</span>
                    <span className="font-bold text-slate-800">{h.selectedSession.closedAt ? formatDateTimeDisplay(h.selectedSession.closedAt) : 'En curso'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold mb-1">Usuario</span>
                    <span className="font-bold text-slate-800">{h.selectedSession.userId}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold mb-1">Estado</span>
                    <span className="font-bold text-slate-800">{h.selectedSession.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
                  </div>
                </div>
                <div className="h-px bg-slate-200 my-4" />
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Fondo Inicial</span>
                    <span className="font-mono font-bold text-slate-800">{fmt(h.selectedSession.initialBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Saldo Esperado</span>
                    <span className="font-mono font-bold text-blue-600">{fmt(h.selectedSession.expectedBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Saldo Real (Arqueo)</span>
                    <span className="font-mono font-bold text-amber-600">{fmt(h.selectedSession.actualBalance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
                    <span className="text-slate-800 font-bold">Diferencia</span>
                    <span className={clsx(
                      "font-mono font-bold",
                      (parseFloat(h.selectedSession.difference || '0') < 0) ? 'text-red-600' : 'text-emerald-600'
                    )}>
                      {fmt(h.selectedSession.difference || 0)}
                    </span>
                  </div>
                </div>
                {h.selectedSession.closeObservations && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                    <span className="block text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Observaciones</span>
                    <p className="text-xs text-slate-700">{h.selectedSession.closeObservations}</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="documento"
                  size="sm"
                  onClick={() => {
                    window.open(`/api/v1/cash/sessions/${h.selectedSession.id}/print`, '_blank');
                  }}
                >
                  <Printer className="w-3 h-3" /> Reimprimir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => h.setShowViewModal(false)}
                >
                  Cerrar
                </Button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
