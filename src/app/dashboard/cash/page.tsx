'use client';

/**
 * Caja: apertura, gestion, arqueo y cierre, e historico.
 *
 * LOTE 229: la pagina tenia 1.629 lineas y React Doctor la marcaba por
 * complejidad. Se partio SIN cambiar lo que hace: el codigo se movio tal cual.
 * Aqui quedan las pestanas y los envoltorios animados de cada vista (con su
 * `key`, que es lo que `AnimatePresence` necesita para animar la salida); el
 * contenido va en `components/`, el estado y las acciones en `hooks/useCaja` y
 * `hooks/useHistorialCaja`, y los tipos y ayudantes en `caja.ts`.
 */
import { Wallet, Scale, History, RefreshCw } from 'lucide-react';
//  Lote 230: `m` dentro de `LazyMotion` y no `motion` (aviso de React Doctor:
//  `motion` arrastra ~30 kb). Los componentes de `components/` usan `m` tambien.
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { CashView } from './caja';
import { useCaja } from './hooks/useCaja';
import { useHistorialCaja } from './hooks/useHistorialCaja';
import { VistaApertura } from './components/VistaApertura';
import { VistaGestion } from './components/VistaGestion';
import { VistaArqueo } from './components/VistaArqueo';
import { VistaHistorico } from './components/VistaHistorico';
import { ModalMovimiento } from './components/ModalMovimiento';
import { ModalCierre } from './components/ModalCierre';
import { ModalVerSesion } from './components/ModalVerSesion';

//  Lote 230: fuera del componente; no depende de nada y no hace falta
//  rehacerla en cada render (React Doctor).
const TABS: { id: CashView; label: string; icon: React.ReactNode }[] = [
  { id: 'gestion', label: 'Gestión de Caja', icon: <Wallet className="w-4 h-4" /> },
  { id: 'arqueo', label: 'Arqueo y Cierre', icon: <Scale className="w-4 h-4" /> },
  { id: 'historico', label: 'Histórico de Cierres', icon: <History className="w-4 h-4" /> },
];

export default function CashPage() {
  //  Cada hook necesita una accion del otro: se pasan como funciones que se
  //  llaman DESPUES, asi que da igual cual se declare primero.
  const historial = useHistorialCaja({ recargarCaja: () => caja.loadCashData() });
  const caja = useCaja({ alAbrirHistorico: () => historial.loadHistory() });

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (caja.view === 'loading') {
    return (
      <LazyMotion features={domAnimation}>
      <div className="flex items-center justify-center h-full min-h-[60vh] max-w-7xl mx-auto w-full">
        <m.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <RefreshCw className="w-8 h-8 text-blue-900" />
        </m.div>
      </div>
      </LazyMotion>
    );
  }

  // ─── SESSION ACTIVE: Tab navigation ──────────────────────────────────────
  return (
    <LazyMotion features={domAnimation}>
    <div className="space-y-0">
      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => caja.handleTabChange(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition rounded-t-lg',
              (caja.view === tab.id || (tab.id === 'gestion' && caja.view === 'apertura'))
                ? 'border-[#c5a059] text-[#c5a059] bg-amber-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── GESTIÓN VIEW ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {caja.view === 'apertura' && (
          <m.div
            key="apertura"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-4 flex items-center justify-center min-h-[calc(100vh-240px)] bg-slate-50"
          >
            <VistaApertura c={caja} />
          </m.div>
        )}
        {caja.view === 'gestion' && (
          <m.div
            key="gestion"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-4 space-y-4"
          >
            <VistaGestion c={caja} />
          </m.div>
        )}

        {/* ── ARQUEO VIEW ─────────────────────────────────────────────── */}
        {caja.view === 'arqueo' && (
          <m.div
            key="arqueo"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-4 space-y-4"
          >
            <VistaArqueo c={caja} />
          </m.div>
        )}

        {/* ── HISTÓRICO VIEW ───────────────────────────────────────────── */}
        {caja.view === 'historico' && (
          <m.div
            key="historico"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-4 space-y-4"
          >
            <VistaHistorico h={historial} />
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Movement modal ───────────────────────────────────────────────── */}
      <ModalMovimiento c={caja} />

      {/* ── Success close modal ─────────────────────────────────────────── */}
      <ModalCierre c={caja} />

      {/* ── View Session Modal ───────────────────────────────────────────── */}
      <ModalVerSesion h={historial} />

      {/* Removed Global Print overlay */}

    </div>
    </LazyMotion>
  );
}
