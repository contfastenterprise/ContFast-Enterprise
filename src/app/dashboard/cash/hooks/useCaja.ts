'use client';

/**
 * El estado y las acciones de la caja abierta: apertura, movimientos, arqueo y
 * cierre, y la pestana visible. Salio de `page.tsx` al partirla (lote 229), sin
 * cambiar una linea; lo unico nuevo es `alAbrirHistorico`, porque al abrir el
 * historico se carga, y el historico vive en `useHistorialCaja`.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { DENOMINATIONS, type CashView, type Session, type Movement, type Register } from '../caja';

export function useCaja({ alAbrirHistorico }: { alAbrirHistorico: () => void }) {
  const [view, setView] = useState<CashView>('loading');

  // Data
  const [session, setSession] = useState<Session | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);

  // Apertura form
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New POS register modal
  const [showNewRegisterModal, setShowNewRegisterModal] = useState(false);
  const [newRegisterForm, setNewRegisterForm] = useState({ name: '', code: '' });
  const [creatingRegister, setCreatingRegister] = useState(false);

  // Movement modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveType, setMoveType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveDescription, setMoveDescription] = useState('');

  // Arqueo state
  const [denomQty, setDenomQty] = useState<Record<number, number>>({});
  // Lote 172: el resultado del arqueo, tal como lo devuelve el cierre. Antes de
  // cerrar no existe: es lo que el arqueo ciego no deja ver.

  const [resultadoArqueo, setResultadoArqueo] = useState<{
    expectedBalance: string; actualBalance: string; difference: string; totalTransferencias?: string;
  } | null>(null);
  const [closeObservations, setCloseObservations] = useState('');
  const [closing, setClosing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);


  // ─── Loaders ──────────────────────────────────────────────────────────────
  const loadCashData = useCallback(async () => {
    setView('loading');
    try {
      const [sessRes, regRes] = await Promise.all([
        fetch('/api/v1/cash/sessions/active'),
        fetch('/api/v1/cash/registers'),
      ]);

      const sessData = await sessRes.json();
      const regData = await regRes.json();

      if (regData.success) {
        setRegisters(regData.data || []);
        if (regData.data?.length > 0) setSelectedRegisterId(regData.data[0].id);
      }

      if (sessData.success && sessData.data) {
        setSession(sessData.data);
        // Load movements
        const movRes = await fetch(`/api/v1/cash/sessions/${sessData.data.id}/movements`);
        const movData = await movRes.json();
        if (movData.success) setMovements(movData.data || []);
        setView('gestion');
      } else {
        setSession(null);
        setView('apertura');
      }
    } catch (error) {
      console.error('Failed to load cash data:', error);
      toast.error('Error al cargar datos de caja.');
      setView('apertura');
    }
  }, []);


  useEffect(() => {
    loadCashData();
  }, [loadCashData]);

  const refreshMovements = useCallback(async () => {
    if (!session) return;
    try {
      const movRes = await fetch(`/api/v1/cash/sessions/${session.id}/movements`);
      const movData = await movRes.json();
      if (movData.success) setMovements(movData.data || []);
      // Also refresh session expected balance
      const sessRes = await fetch('/api/v1/cash/sessions/active');
      const sessData = await sessRes.json();
      if (sessData.success && sessData.data) setSession(sessData.data);
    } catch {
      toast.error('Error al actualizar movimientos.');
    }
  }, [session]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCreateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegisterForm.name || !newRegisterForm.code) {
      toast.error('Por favor, complete todos los campos de la terminal.');
      return;
    }
    setCreatingRegister(true);
    try {
      const res = await fetch('/api/v1/cash/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRegisterForm),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Terminal de punto de venta creada exitosamente.');
        setShowNewRegisterModal(false);
        setNewRegisterForm({ name: '', code: '' });
        
        // Reload registers and auto-select
        const regRes = await fetch('/api/v1/cash/registers');
        const regData = await regRes.json();
        if (regData.success) {
          setRegisters(regData.data || []);
          if (data.data?.id) setSelectedRegisterId(data.data.id);
        }
      } else {
        toast.error(data.error?.message || 'Error al crear la terminal');
      }
    } catch {
      toast.error('Error de red al crear la terminal');
    } finally {
      setCreatingRegister(false);
    }
  };

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
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al abrir sesión.');
      toast.success('¡Caja abierta exitosamente!');
      await loadCashData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !moveAmount || !moveDescription) {
      toast.error('Complete todos los campos.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/cash/sessions/${session.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: moveType,
          amount: parseFloat(moveAmount),
          description: moveDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al registrar movimiento.');
      toast.success('Movimiento registrado.');
      setShowMoveModal(false);
      setMoveAmount('');
      setMoveDescription('');
      await refreshMovements();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Arqueo calculations ─────────────────────────────────────────────────
  const getCashTotal = () => {
    let total = 0;
    for (const denom of DENOMINATIONS) {
      total += (denomQty[denom.value] || 0) * denom.value;
    }
    return total;
  };

  // Lote 172, arqueo ciego: el esperado y la diferencia YA NO se calculan aqui.
  // El servidor no los manda mientras la sesion esta abierta, y salen en la
  // respuesta del cierre. Lo unico que la pantalla sabe es lo que se ha contado.
  const getRealBalance = () => getCashTotal();

  const handleCloseSession = async () => {
    if (!session) return;
    // El desglose ENTERO, con los ceros: declarar que no hay billetes de 2.000
    // es parte del arqueo, y el servidor lo exige (conteoDeCaja.ts).
    const conteo = DENOMINATIONS.map((d) => ({ denominacion: d.value, cantidad: denomQty[d.value] || 0 }));

    setClosing(true);
    try {
      const res = await fetch(`/api/v1/cash/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteo,
          justification: closeObservations || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al cerrar sesión.');
      // El resultado del arqueo: ahora si se puede ver.
      setResultadoArqueo(data.data?.summary ?? null);
      setClosedSessionId(session.id);
      setShowSuccessModal(true);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setClosing(false);
    }
  };

  const handleSuccessClose = async () => {
    setShowSuccessModal(false);
    setClosedSessionId(null);
    setDenomQty({});
    setResultadoArqueo(null);
    setCloseObservations('');
    await loadCashData();
  };


  const handleTabChange = (newView: CashView) => {
    if (newView === 'arqueo' && !session) {
      toast.error('Debe abrir una sesión de caja para realizar el arqueo.');
      return;
    }
    if (newView === 'historico') alAbrirHistorico();
    if (newView === 'gestion' && !session) {
      setView('apertura');
    } else {
      setView(newView);
    }
  };

  return { view, setView, session, setSession, movements, setMovements, registers, setRegisters, selectedRegisterId, setSelectedRegisterId, initialBalance, setInitialBalance, submitting, setSubmitting, showNewRegisterModal, setShowNewRegisterModal, newRegisterForm, setNewRegisterForm, creatingRegister, setCreatingRegister, showMoveModal, setShowMoveModal, moveType, setMoveType, moveAmount, setMoveAmount, moveDescription, setMoveDescription, denomQty, setDenomQty, resultadoArqueo, setResultadoArqueo, closeObservations, setCloseObservations, closing, setClosing, showSuccessModal, setShowSuccessModal, closedSessionId, setClosedSessionId, loadCashData, refreshMovements, handleCreateRegister, handleOpenSession, handleAddMovement, getCashTotal, getRealBalance, handleCloseSession, handleSuccessClose, handleTabChange };
}

export type Caja = ReturnType<typeof useCaja>;
