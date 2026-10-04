'use client';

/**
 * La gestion de la caja abierta: balance, metodos de pago y movimientos.
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 * Solo pinta: el estado y las acciones viven en `useCaja`.
 */
import { Wallet, Plus, Minus, Scale, RefreshCw, TrendingUp, AlertTriangle, Download, ClipboardList } from 'lucide-react';
import clsx from 'clsx';
import { TEXTO_SALDO_OCULTO } from '@/services/caja/arqueoCiego';
import { formatTimeDisplay } from '@/utils/fechasLocales';
import { fmt, movType } from '../caja';
import type { Caja } from '../hooks/useCaja';
import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

export function VistaGestion({ c }: { c: Caja }) {
  return (
    <>
      {/* Header */}
      <CabeceraDePagina
        titulo="Gestión de Caja"
        descripcion={
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Turno en curso — iniciado{' '}
            {c.session ? formatTimeDisplay(c.session.createdAt) : ''}
          </span>
        }
        acciones={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { c.setMoveType('cash_in'); c.setShowMoveModal(true); }}>
              <Plus className="w-4 h-4" />
              Entrada de Efectivo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { c.setMoveType('cash_out'); c.setShowMoveModal(true); }}>
              <Minus className="w-4 h-4" />
              Salida de Efectivo
            </Button>
            <Button
              type="button"
              onClick={() => c.handleTabChange('arqueo')}>
              <Scale className="w-4 h-4" />
              Arqueo y Cierre
            </Button>
          </>
        }
      />

      {/* Bento grid: Balance + Métodos de pago */}
      <div className="grid grid-cols-12 gap-4">
        {/* Balance card */}
        <div className="col-span-12 md:col-span-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Balance Actual</p>
            {/* Lote 228: con el saldo oculto se dice, en vez de pintar 0,00. */}
            {c.session?.saldoVisible ? (
              <p className="text-4xl font-extrabold text-[#001e40] tracking-tight">
                {fmt(c.session.expectedBalance || '0')}
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-500">{TEXTO_SALDO_OCULTO}</p>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fondo Inicial</p>
              <p className="font-mono text-xs text-slate-700">{fmt(c.session?.initialBalance || '0')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transacciones</p>
              <p className="font-mono text-xs text-slate-700">{c.movements.length}</p>
            </div>
          </div>
        </div>

        {/* Payment method cards */}
        <div className="col-span-12 md:col-span-8 grid grid-cols-3 gap-4">
          {[
            {
              icon: <Wallet className="w-5 h-5 text-amber-700" />,
              label: 'EFECTIVO',
              color: 'bg-amber-50',
              //  Lote 228: esta suma ES el saldo menos el fondo; a ciegas no se da hecha.
              amount: c.session?.saldoVisible
                ? c.movements.filter(m => !m.reference?.includes('card')).reduce((s, m) =>
                  s + (m.type === 'sale' || m.type === 'cash_in' ? parseFloat(m.amount) : -parseFloat(m.amount)), 0)
                : null,
              count: c.movements.filter(m => m.type === 'sale' || m.type === 'cash_in').length,
            },
            {
              icon: <ClipboardList className="w-5 h-5 text-blue-700" />,
              label: 'TARJETA',
              color: 'bg-blue-50',
              amount: 0,
              count: 0,
            },
            {
              icon: <TrendingUp className="w-5 h-5 text-slate-500" />,
              label: 'OTROS',
              color: 'bg-slate-50',
              amount: 0,
              count: 0,
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className={clsx('p-2 rounded-lg', card.color)}>{card.icon}</div>
                <span className={clsx('text-[10px] px-2 py-0.5 rounded font-bold', card.color, 'text-slate-500')}>
                  {card.label}
                </span>
              </div>
              <div className="mt-auto">
                <p className="text-lg font-bold text-[#001e40]">{card.amount === null ? '—' : fmt(card.amount)}</p>
                <p className="text-xs text-slate-500">{card.count} Transacciones</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Movements table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">Movimientos de Caja</h3>
          <div className="flex gap-2">
            <IconButton
              type="button"
              onClick={c.refreshMovements}
              title="Actualizar"
              aria-label="Actualizar los movimientos de caja"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </IconButton>
            <IconButton type="button" title="Exportar" aria-label="Exportar los movimientos de caja">
              <Download className="w-4 h-4 text-slate-500" />
            </IconButton>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hora</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Concepto</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {c.movements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-xs">
                    No hay movimientos registrados en este turno.
                  </td>
                </tr>
              ) : (
                c.movements.map((mv) => {
                  const { label, colorClass } = movType(mv.type);
                  const isPositive = mv.type === 'sale' || mv.type === 'cash_in';
                  return (
                    <tr key={mv.id} className="hover:bg-amber-50/30 transition-colors border-b border-slate-200 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {formatTimeDisplay(mv.createdAt)}
                      </td>
                      <td className={clsx('px-4 py-2.5 font-bold', colorClass)}>{label}</td>
                      <td className="px-4 py-2.5 text-slate-700">{mv.description || mv.reference || '—'}</td>
                      <td className={clsx('px-4 py-2.5 text-right font-mono font-bold', isPositive ? 'text-emerald-700' : 'text-red-700')}>
                        {isPositive ? '' : '−'}{fmt(mv.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full uppercase">
                          Registrado
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {c.movements.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200">
                  <td className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500" colSpan={3}>
                    Total Neto en Caja
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">
                    {c.session?.saldoVisible ? fmt(c.session.expectedBalance || '0') : TEXTO_SALDO_OCULTO}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Security reminder */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-4 items-start">
        <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-800">Recordatorio de Seguridad</p>
          <p className="text-xs text-blue-600 mt-0.5">
            El arqueo de caja debe realizarse al finalizar cada turno. Cuente el efectivo físico antes de proceder con el cierre digital.
          </p>
        </div>
      </div>
    </>
  );
}
