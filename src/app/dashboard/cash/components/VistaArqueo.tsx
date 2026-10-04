'use client';

/**
 * El arqueo ciego y el cierre de la caja (lotes 172 y 228).
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 * Solo pinta: el estado y las acciones viven en `useCaja`.
 */
import { Wallet, RefreshCw, TrendingUp, Printer } from 'lucide-react';
import { useState } from 'react';
//  Lote 230: `m` y no `motion`; el `LazyMotion` lo pone la pagina.
import { m } from 'framer-motion';
import clsx from 'clsx';
import { formatDateTimeDisplay } from '@/utils/fechasLocales';
import { fmt, DENOMINATIONS } from '../caja';
import type { Caja } from '../hooks/useCaja';
import { Button } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

export function VistaArqueo({ c }: { c: Caja }) {
  //  Lote 230: la hora del arqueo es la de cuando se abrio la pestana, tomada una
  //  vez. `new Date()` dentro del JSX cambiaba en cada tecla del conteo y daba un
  //  valor distinto en el servidor y en el navegador (React Doctor).
  const [ahora] = useState(() => new Date());
  return (
    <>
      {/* Header */}
      <CabeceraDePagina
        titulo="Arqueo y Cierre de Caja"
        descripcion="Realice el conteo físico para finalizar el turno de trabajo."
        acciones={
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Fecha y Hora</p>
            <p className="font-mono text-sm font-bold text-[#001e40]">
              {formatDateTimeDisplay(ahora)}
            </p>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Denomination form */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-slate-500" />
                Desglose de Efectivo (DOP)
              </h2>
              <button
                type="button"
                onClick={() => { c.setDenomQty({}); }}
                className="text-[10px] font-bold text-amber-700 hover:underline underline-offset-4"
              >
                Limpiar Formulario
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-4 items-center bg-slate-50 px-4 py-2 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              <div className="col-span-5">Denominación</div>
              <div className="col-span-3 text-center">Cantidad</div>
              <div className="col-span-4 text-right">Subtotal</div>
            </div>

            {/* Denomination rows */}
            <div className="space-y-1">
              {DENOMINATIONS.map((d) => {
                const qty = c.denomQty[d.value] || 0;
                const subtotal = qty * d.value;
                return (
                  <div key={d.value} className="grid grid-cols-12 gap-4 items-center px-4 py-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="col-span-5 flex items-center gap-3">
                      <div className={clsx('w-10 h-7 rounded border flex items-center justify-center text-[10px] font-bold', d.color)}>
                        RD$
                      </div>
                      <span className="text-xs font-bold text-slate-700">{d.label}</span>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="0"
                        value={qty || ''}
                        onChange={(e) => c.setDenomQty(prev => ({
                          ...prev,
                          [d.value]: parseInt(e.target.value) || 0,
                        }))}
                        placeholder="0"
                        aria-label={`Cantidad de ${d.label}`}
                        className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center font-mono text-xs focus:ring-1 focus:ring-[#c5a059]/20 focus:border-[#c5a059] outline-none transition text-slate-800"
                      />
                    </div>
                    <div className="col-span-4 text-right font-mono text-xs font-bold text-slate-700">
                      {fmt(subtotal)}
                    </div>
                  </div>
                );
              })}

              {/* Lote 172: el campo libre "Total Monedas" ya no existe.
                  Admitia cualquier importe y por ahi entraron los
                  2.204.992,49 de la sesion de agosto. Las monedas se
                  cuentan por denominacion, como los billetes: las filas
                  de arriba las incluyen (DENOMINACIONES). */}
            </div>

            {/* Observations */}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <label htmlFor="caja-observaciones-cierre" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Observaciones del Cierre
              </label>
              <textarea
                id="caja-observaciones-cierre"
                value={c.closeObservations}
                onChange={(e) => c.setCloseObservations(e.target.value)}
                placeholder="Escriba cualquier novedad o discrepancia detectada..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 focus:ring-1 focus:ring-[#c5a059]/20 focus:border-[#c5a059] outline-none resize-none transition"
              />
            </div>
          </div>
        </div>

        {/* Right: Summary + Actions */}
        <div className="lg:col-span-5 space-y-4">
          {/* Audit summary card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
              <Wallet className="w-16 h-16 text-[#001e40]" />
            </div>
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#001e40]">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Resumen de Auditoría
            </h2>
            {/* Lote 172, ARQUEO CIEGO: aqui salia "Saldo Esperado en
                Sistema" y la diferencia en vivo, mientras se contaba. Con
                la cifra a la vista el conteo es copiable, y se copio: las
                tres sesiones cerradas cuadran al centavo. Ahora solo se
                ve lo contado; el esperado y la diferencia salen al
                cerrar. */}
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Contado</p>
                <p className="text-3xl font-mono font-extrabold tracking-tight text-amber-600">{fmt(c.getRealBalance())}</p>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-lg border bg-slate-50 border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Arqueo a ciegas</p>
              <p className="text-[11px] text-slate-600 leading-snug">
                Cuente el efectivo y registre el desglose. El saldo esperado y la diferencia
                aparecen al cerrar la sesión, no antes.
              </p>
            </div>
          </div>

          {/* Lote 172: este bloque sumaba fondo inicial + entradas −
              salidas y remataba con "Total Esperado". Eso ES el saldo
              esperado: dejarlo aqui haria del arqueo ciego un adorno.
              El detalle de movimientos sigue disponible en su pestaña,
              porque el cajero tiene derecho a ver lo que registro; lo que
              se retira es la SUMA ya hecha al lado del formulario. */}

          {/* Close button */}
          <div className="space-y-3">
            <Button
              type="button"
              onClick={c.handleCloseSession}
              disabled={c.closing}
              className="flex w-full">
              {c.closing ? (
                <m.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw className="w-4 h-4" />
                </m.div>
              ) : (
                <Printer className="w-4 h-4" />
              )}
              {c.closing ? 'Cerrando turno...' : 'Finalizar Turno e Imprimir Arqueo'}
            </Button>
            <p className="text-center text-[10px] text-slate-500 italic">
              * Al confirmar, se cerrará la sesión de la terminal y se generará el reporte de cierre.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
