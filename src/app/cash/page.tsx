'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Wallet, Plus, ArrowUpRight, ArrowDownRight, Check, AlertTriangle, RefreshCw, X, History, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function CashPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [registers, setRegisters] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Apertura Form State
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [initialBalance, setInitialBalance] = useState('');

  // Movement Form State
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveType, setMoveType] = useState('cash_in'); // cash_in | cash_out
  const [moveAmount, setMoveAmount] = useState('');
  const [moveDescription, setMoveDescription] = useState('');

  // Close Session Form State
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualBalance, setActualBalance] = useState('');
  const [closeJustification, setCloseJustification] = useState('');

  // Initialize
  useEffect(() => {
    async function loadCashData() {
      setLoading(true);
      try {
        // 1. Fetch active session
        const sessRes = await fetch('/api/v1/cash/sessions/active');
        const sessData = await sessRes.json();
        if (sessData.success && sessData.data) {
          setActiveSession(sessData.data);
        } else {
          setActiveSession(null);
        }

        // 2. Fetch registers for opening selector
        const regRes = await fetch('/api/v1/cash/registers');
        const regData = await regRes.json();
        if (regData.success) {
          setRegisters(regData.data || []);
          if (regData.data?.length > 0) {
            setSelectedRegisterId(regData.data[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load cash registry details:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCashData();
  }, []);

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterId || !initialBalance) {
      toast.error('Complete todos los campos de apertura.');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/cash/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashRegisterId: selectedRegisterId,
          initialBalance: parseFloat(initialBalance),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al abrir caja.');
      }

      toast.success('¡Sesión de Caja Abierta!', {
        description: 'Caja lista para operaciones de facturación.',
      });

      setActiveSession(data.data);
    } catch (error: any) {
      toast.error('Fallo de apertura', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveAmount || !moveDescription) {
      toast.error('Complete los datos del movimiento.');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch(`/api/v1/cash/sessions/${activeSession.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: moveType,
          amount: parseFloat(moveAmount),
          description: moveDescription,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al registrar movimiento.');
      }

      toast.success('Movimiento registrado exitosamente.');
      setShowMoveModal(false);
      setMoveAmount('');
      setMoveDescription('');

      // Reload active session details to update expected balances
      const sessRes = await fetch('/api/v1/cash/sessions/active');
      const sessData = await sessRes.json();
      if (sessData.success && sessData.data) {
        setActiveSession(sessData.data);
      }
    } catch (error: any) {
      toast.error('Fallo en movimiento', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualBalance) {
      toast.error('Indique el balance real contado en caja.');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch(`/api/v1/cash/sessions/${activeSession.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualBalance: parseFloat(actualBalance),
          justification: closeJustification || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al cerrar caja.');
      }

      toast.success('¡Caja Cerrada y Cuadrada!', {
        description: 'La sesión ha sido archivada correctamente.',
      });

      setActiveSession(null);
      setShowCloseModal(false);
      setActualBalance('');
      setCloseJustification('');
    } catch (error: any) {
      toast.error('Fallo en cierre', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-slate-400 text-sm">Cargando estado de caja terminal...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Title Header */}
        <div className="border-b border-slate-900 pb-5">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
            <Wallet className="h-7 w-7 text-amber-500" />
            Módulo de Caja y Terminal
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Abra y cierre turnos de venta física, realice auditoría de saldo y registre movimientos.
          </p>
        </div>

        {activeSession ? (
          // ACTIVE SESSION VIEW
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Session Info & Actions */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-lg space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-emerald-500 text-xs font-semibold uppercase flex items-center gap-1">
                    ● Caja Abierta / Operando
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">
                    Terminal: {activeSession.registerName || 'Caja Principal'}
                  </h3>
                </div>
                <span className="text-slate-400 text-xs font-mono">
                  Iniciada: {new Date(activeSession.openedAt).toLocaleTimeString('es-DO')}
                </span>
              </div>

              {/* Balance Summary Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-5">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Fondo de Apertura</span>
                  <p className="text-xl font-bold text-white mt-1">
                    RD$ {parseFloat(activeSession.initialBalance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-5">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Saldo Esperado Contable</span>
                  <p className="text-xl font-bold text-amber-500 mt-1">
                    RD$ {parseFloat(activeSession.expectedBalance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Session Operations */}
              <div className="flex flex-wrap gap-4 border-t border-slate-800 pt-6">
                <button
                  onClick={() => {
                    setMoveType('cash_in');
                    setShowMoveModal(true);
                  }}
                  className="flex items-center gap-2 rounded-md bg-slate-950 border border-slate-850 px-4 py-2.5 text-sm font-semibold text-slate-350 hover:bg-slate-850 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Registrar Entrada
                </button>
                <button
                  onClick={() => {
                    setMoveType('cash_out');
                    setShowMoveModal(true);
                  }}
                  className="flex items-center gap-2 rounded-md bg-slate-950 border border-slate-850 px-4 py-2.5 text-sm font-semibold text-slate-350 hover:bg-slate-850 transition-colors"
                >
                  <ArrowDownRight className="h-4 w-4 text-rose-500" />
                  Registrar Salida / Gasto
                </button>
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="flex items-center gap-2 rounded-md bg-rose-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition-colors shadow-lg shadow-rose-500/5 ml-auto"
                >
                  <Lock className="h-4 w-4" />
                  Cerrar y Cuadrar Caja
                </button>
              </div>

            </div>

            {/* Quick Helper Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-lg space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white uppercase tracking-wider">Reglas del Cajero</h3>
              </div>
              <div className="space-y-4 text-xs text-slate-400 leading-relaxed">
                <p>
                  1. <strong className="text-white">Fondo Fijo Inmutable:</strong> El fondo asignado en la apertura no puede modificarse bajo ningún concepto del sistema.
                </p>
                <p>
                  2. <strong className="text-white">Aprobaciones de Salida:</strong> Cualquier retiro manual o devolución que exceda el límite autorizado requerirá la aprobación digital del supervisor mediante su código de verificación.
                </p>
                <p>
                  3. <strong className="text-white">Auditoría Automática:</strong> Al realizar el cierre, el sistema compara el balance real con el balance esperado. Cualquier diferencia será reportada a la gerencia financiera de forma automática.
                </p>
              </div>
            </div>

          </div>
        ) : (
          // CLOSED STATE / OPEN SESSION FORM
          <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-lg p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 border border-slate-850 text-amber-500">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Apertura de Turno</h3>
              <p className="text-slate-400 text-xs">Indique la terminal y el fondo inicial disponible.</p>
            </div>

            <form onSubmit={handleOpenSession} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300 uppercase">Terminal de Caja</label>
                <select
                  value={selectedRegisterId}
                  onChange={(e) => setSelectedRegisterId(e.target.value)}
                  className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                >
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                  {registers.length === 0 && (
                    <option value="">No hay terminales creadas</option>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300 uppercase">Fondo Inicial de Caja (Efectivo)</label>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  placeholder="RD$ 5,000.00"
                  min={0}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full justify-center items-center gap-2 rounded-md bg-amber-500 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Registrando apertura...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Abrir Caja y Turno
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* MODAL: Register Cash Movement */}
        <AnimatePresence>
          {showMoveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMoveModal(false)}
                className="fixed inset-0 bg-black"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl z-10 text-slate-300 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-semibold text-white uppercase tracking-wider">
                    {moveType === 'cash_in' ? 'Registrar Entrada Dinero' : 'Registrar Retiro / Gasto'}
                  </h3>
                  <button onClick={() => setShowMoveModal(false)} className="text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleRegisterMovement} className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Monto (RD$)</label>
                    <input
                      type="number"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="0.00"
                      min={0.01}
                      step="any"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Justificación / Concepto</label>
                    <textarea
                      value={moveDescription}
                      onChange={(e) => setMoveDescription(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm h-20 resize-none"
                      placeholder="Describa el motivo del movimiento..."
                      required
                    />
                  </div>

                  <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowMoveModal(false)}
                      className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                    >
                      Guardar Movimiento
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: Close and Audit Session */}
        <AnimatePresence>
          {showCloseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCloseModal(false)}
                className="fixed inset-0 bg-black"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl z-10 text-slate-300 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-semibold text-white uppercase tracking-wider">Cierre y Arqueo de Caja</h3>
                  <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCloseSession} className="space-y-4">
                  <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-md text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Esperado Contable:</span>
                      <span className="font-semibold text-white">
                        RD$ {parseFloat(activeSession.expectedBalance).toLocaleString('es-DO')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Efectivo Real Contado</label>
                    <input
                      type="number"
                      value={actualBalance}
                      onChange={(e) => setActualBalance(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="0.00"
                      min={0}
                      step="any"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Justificación Diferencia (Opcional)</label>
                    <textarea
                      value={closeJustification}
                      onChange={(e) => setCloseJustification(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm h-20 resize-none"
                      placeholder="Explique el faltante o sobrante si existe..."
                    />
                  </div>

                  <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCloseModal(false)}
                      className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-400"
                    >
                      Cerrar Turno
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
}
