'use client';

/**
 * La apertura de turno y la ventana "Nueva Terminal de Caja".
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 * Solo pinta: el estado y las acciones viven en `useCaja`.
 */
import { useRouter } from 'next/navigation';
import { Wallet, Lock, RefreshCw, CheckCircle2, X, Loader2 } from 'lucide-react';
//  Lote 230: `m` y no `motion`; el `LazyMotion` lo pone la pagina.
import { m, AnimatePresence } from 'framer-motion';
import type { Caja } from '../hooks/useCaja';

export function VistaApertura({ c }: { c: Caja }) {
  const router = useRouter();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  return (
    <>
      {/* Apertura Card */}
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden z-10">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Apertura de Turno de Caja
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Inicie su jornada laboral validando los datos de la terminal.
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={c.handleOpenSession} className="p-4 space-y-4">
          {/* Terminal + Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="caja-terminal" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0">
                  Punto de Venta <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => c.setShowNewRegisterModal(true)}
                  className={`text-xs font-bold px-2 py-0.5 rounded transition ${
                    c.registers.length === 0
                      ? 'bg-[#003366] text-white hover:bg-[#002244] animate-pulse hover:animate-none'
                      : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                  }`}
                >
                  + Nueva Terminal
                </button>
              </div>
              <select
                id="caja-terminal"
                value={c.selectedRegisterId}
                onChange={(e) => c.setSelectedRegisterId(e.target.value)}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition text-slate-800"
                required
              >
                {c.registers.length === 0 && (
                  <option value="">Sin terminales configuradas</option>
                )}
                {c.registers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="caja-fecha-apertura" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Fecha de Apertura
              </label>
              <input
                id="caja-fecha-apertura"
                type="date"
                defaultValue={dateStr}
                readOnly
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-500 font-mono cursor-not-allowed outline-none"
              />
            </div>
          </div>

          {/* Time row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="caja-hora-inicio" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Hora de Inicio
              </label>
              <input
                id="caja-hora-inicio"
                type="time"
                defaultValue={timeStr}
                readOnly
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-500 font-mono cursor-not-allowed outline-none"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <div className="flex items-center gap-2 text-green-700 text-xs font-semibold bg-green-50 border border-green-200 px-4 py-2 rounded-xl w-full justify-center">
                <CheckCircle2 className="w-4 h-4" />
                Conexión segura activa
              </div>
            </div>
          </div>

          {/* Opening Balance */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="caja-fondo-inicial" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Monto de Apertura (Fondo de Caja) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500 text-sm">
                RD$
              </div>
              <input
                id="caja-fondo-inicial"
                type="number"
                value={c.initialBalance}
                onChange={(e) => c.setInitialBalance(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full h-10 pl-12 pr-3 py-1.5 text-lg rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-mono font-bold focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition"
                required
              />
            </div>
            <p className="text-[10px] text-slate-500 pl-1">
              Sugerencia: Monto base operativo (RD$ 5,000.00)
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={c.submitting || c.registers.length === 0}
              className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
            >
              {c.submitting ? (
                <m.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw className="w-4 h-4" />
                </m.div>
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {c.submitting ? 'Procesando...' : 'Abrir Caja'}
            </button>
          </div>
        </form>

        {/* Status bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Esperando autorización de terminal...
          </p>
        </div>
      </div>

      {/* ── New POS Terminal Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {c.showNewRegisterModal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-xl shadow-xl overflow-hidden bg-white text-slate-800"
            >
              <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-white">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Nueva Terminal de Caja</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Configure una nueva terminal para su empresa.</p>
                </div>
                <button type="button" onClick={() => c.setShowNewRegisterModal(false)} aria-label="Cerrar la ventana de nueva terminal" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={c.handleCreateRegister} className="p-4 space-y-4">
                <div className="space-y-1">
                  <label htmlFor="caja-terminal-nombre" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Nombre de la Terminal <span className="text-red-500">*</span></label>
                  <input
                    id="caja-terminal-nombre"
                    type="text"
                    required
                    value={c.newRegisterForm.name}
                    onChange={e => c.setNewRegisterForm({ ...c.newRegisterForm, name: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
                    placeholder="Ej. Caja Principal, Terminal 1"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="caja-terminal-codigo" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Código Único <span className="text-red-500">*</span></label>
                  <input
                    id="caja-terminal-codigo"
                    type="text"
                    required
                    value={c.newRegisterForm.code}
                    onChange={e => c.setNewRegisterForm({ ...c.newRegisterForm, code: e.target.value.toUpperCase() })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono uppercase"
                    placeholder="Ej. CAJA-01"
                  />
                  <p className="text-[10px] text-slate-500">Identificador único interno para esta terminal.</p>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => c.setShowNewRegisterModal(false)}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={c.creatingRegister}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    {c.creatingRegister ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Crear Terminal
                  </button>
                </div>
              </form>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
