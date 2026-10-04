'use client';

/**
 * El estado y las acciones de la caja abierta: apertura, movimientos, arqueo y
 * cierre, y la pestana visible. Salio de `page.tsx` al partirla (lote 229), sin
 * cambiar una linea; lo unico nuevo es `alAbrirHistorico`, porque al abrir el
 * historico se carga, y el historico vive en `useHistorialCaja`.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
//  Lote 230: toda respuesta se lee mirando el ESTADO antes que el cuerpo (el
//  lector del lote 227). Antes: `await res.json()` y despues `data.success`, asi
//  que un 5xx con pagina de error hacia lanzar a `json()` y el mensaje que salia
//  era el del analizador ("Unexpected token <"), no el del servidor.
import { leerRespuesta } from '@/utils/leerRespuesta';
import { DENOMINATIONS, type CashView, type Session, type Movement, type Register } from '../caja';
import { archivoDeMovimientos } from '../exportarCaja';
import { descargarCsv } from '@/utils/descargarCsv';

type ResultadoArqueo = {
  expectedBalance: string; actualBalance: string; difference: string; totalTransferencias?: string;
};

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

  const [resultadoArqueo, setResultadoArqueo] = useState<ResultadoArqueo | null>(null);
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

      const [sesion, cajas] = await Promise.all([
        leerRespuesta<{ data: Session | null }>(sessRes),
        leerRespuesta<{ data: Register[] }>(regRes),
      ]);

      if (cajas.bien) {
        setRegisters(cajas.cuerpo.data || []);
        if (cajas.cuerpo.data?.length > 0) setSelectedRegisterId(cajas.cuerpo.data[0].id);
      }

      //  No poder leer la sesion no es "no hay caja abierta": se dice. Se sigue
      //  mostrando la apertura, como hacia el `catch` de siempre.
      if (!sesion.bien) toast.error(sesion.mensaje || 'Error al cargar datos de caja.');

      if (sesion.bien && sesion.cuerpo.data) {
        const abierta = sesion.cuerpo.data;
        setSession(abierta);
        // Load movements
        const movRes = await fetch(`/api/v1/cash/sessions/${abierta.id}/movements`);
        const mov = await leerRespuesta<{ data: Movement[] }>(movRes);
        if (mov.bien) setMovements(mov.cuerpo.data || []);
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
      const mov = await leerRespuesta<{ data: Movement[] }>(movRes);
      if (mov.bien) setMovements(mov.cuerpo.data || []);
      // Also refresh session expected balance
      const sessRes = await fetch('/api/v1/cash/sessions/active');
      const sesion = await leerRespuesta<{ data: Session | null }>(sessRes);
      if (sesion.bien && sesion.cuerpo.data) setSession(sesion.cuerpo.data);
      if (!mov.bien) toast.error(mov.mensaje || 'Error al actualizar movimientos.');
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
      const leido = await leerRespuesta<{ data: { id?: string } }>(res);
      if (leido.bien) {
        toast.success('Terminal de punto de venta creada exitosamente.');
        setShowNewRegisterModal(false);
        setNewRegisterForm({ name: '', code: '' });
        
        // Reload registers and auto-select
        const regRes = await fetch('/api/v1/cash/registers');
        const cajas = await leerRespuesta<{ data: Register[] }>(regRes);
        if (cajas.bien) {
          setRegisters(cajas.cuerpo.data || []);
          if (leido.cuerpo.data?.id) setSelectedRegisterId(leido.cuerpo.data.id);
        }
      } else {
        toast.error(leido.mensaje || 'Error al crear la terminal');
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
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'Error al abrir sesión.');
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
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'Error al registrar movimiento.');
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
      const leido = await leerRespuesta<{ data?: { summary?: ResultadoArqueo } }>(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'Error al cerrar sesión.');
      // El resultado del arqueo: ahora si se puede ver.
      setResultadoArqueo(leido.cuerpo.data?.summary ?? null);
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

  //  Lote 281: "Exportar" de los movimientos del turno (no tenia onClick); las reglas, en `exportarCaja.ts`.
  const exportarMovimientos = () => {
    if (movements.length === 0) return void toast.error('No hay movimientos para exportar');
    const { nombre, contenido } = archivoDeMovimientos(movements, session, registers);
    descargarCsv(nombre, contenido);
    toast.success('Archivo exportado exitosamente');
  };

  return { view, setView, session, setSession, movements, setMovements, registers, setRegisters, selectedRegisterId, setSelectedRegisterId, initialBalance, setInitialBalance, submitting, setSubmitting, showNewRegisterModal, setShowNewRegisterModal, newRegisterForm, setNewRegisterForm, creatingRegister, setCreatingRegister, showMoveModal, setShowMoveModal, moveType, setMoveType, moveAmount, setMoveAmount, moveDescription, setMoveDescription, denomQty, setDenomQty, resultadoArqueo, setResultadoArqueo, closeObservations, setCloseObservations, closing, setClosing, showSuccessModal, setShowSuccessModal, closedSessionId, setClosedSessionId, loadCashData, refreshMovements, handleCreateRegister, handleOpenSession, handleAddMovement, getCashTotal, getRealBalance, handleCloseSession, handleSuccessClose, handleTabChange, exportarMovimientos };
}

export type Caja = ReturnType<typeof useCaja>;
