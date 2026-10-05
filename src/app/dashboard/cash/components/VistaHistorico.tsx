'use client';

/**
 * El historico de cierres, sus filtros y sus indicadores.
 * Salio de `cash/page.tsx` al partirla (lote 229), con el mismo marcado.
 * Solo pinta: el estado vive en `useHistorialCaja` y `useCaja`.
 */
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight, Download, Filter, Printer, Eye, Loader2, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { ErrorDeCarga } from '@/components/ui/estado-carga';
import { formatDateDisplay, formatTimeDisplay } from '@/utils/fechasLocales';
// La MISMA regla que decide si el panel avisa: si la pantalla usara otra, el
// botón de revisar y el aviso podrían no hablar de lo mismo.
import { diferenciaSinResolver } from '@/services/avisos/vencimientos';
import { fmt } from '../caja';
import type { HistorialCaja } from '../hooks/useHistorialCaja';
import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

export function VistaHistorico({ h }: { h: HistorialCaja }) {
  return (
    <>
      {/* Header */}
      <div>
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <span>Caja</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-bold text-slate-700">Histórico de Cierres</span>
        </nav>
        <CabeceraDePagina
          titulo="Histórico de Cierres de Caja"
          descripcion="Consulta y audita los turnos de facturación finalizados."
          acciones={
            <>
              {/* LOTE 285: decia "EXPORTAR XLS" y baja un .csv (lote 281, `descargarCsv`). Excel lo
                  abre igual, pero quien busca el fichero en Descargas busca lo que el boton prometio. */}
              <Button type="button" variant="documento" onClick={h.handleExportHistory}>
                <Download className="w-4 h-4" />
                EXPORTAR CSV
              </Button>
              <Button
                type="button"
                onClick={h.loadHistory}>
                <RefreshCw className="w-4 h-4" />
                ACTUALIZAR
              </Button>
            </>
          }
        />
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label htmlFor="caja-historico-desde" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Desde Fecha</label>
            <input
              id="caja-historico-desde"
              type="date"
              value={h.histDateFrom}
              onChange={(e) => h.setHistDateFrom(e.target.value)}
              className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="caja-historico-estado" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado del Cierre</label>
            <select
              id="caja-historico-estado"
              value={h.histStatus}
              onChange={(e) => h.setHistStatus(e.target.value)}
              className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
            >
              <option value="">Todos los estados</option>
              <option value="closed">Cerrado</option>
              <option value="open">Abierto</option>
            </select>
          </div>
          <div className="md:col-start-4 flex items-center gap-2">
            <Button variant="secondary"
              type="button"
              onClick={() => { h.setHistDateFrom(''); h.setHistStatus(''); }}
              className="flex-1">
              LIMPIAR
            </Button>
            <Button
              type="button"
              onClick={h.loadHistory}
              className="flex-[2]"
            >
              <Filter className="w-3 h-3" />
              APLICAR
            </Button>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Apertura', 'Cierre', 'Terminal', 'Esperado (RD$)', 'Real (RD$)', 'Diferencia', 'Acciones'].map(col => (
                  <th key={col} className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {h.errorCarga ? (
                <tr>
                  <td colSpan={7}>
                    <ErrorDeCarga mensaje={h.errorCarga} onReintentar={h.loadHistory} />
                  </td>
                </tr>
              ) : h.history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay registros de cierres de caja.
                  </td>
                </tr>
              ) : (
                //  Lote 230: filtrar y pintar en UNA pasada (`flatMap`: lo que no
                //  pasa el filtro devuelve []). Mismas dos condiciones de antes.
                h.history.flatMap((s) => {
                    if (h.histStatus && s.status !== h.histStatus) return [];
                    if (h.histDateFrom && new Date(s.createdAt) < new Date(h.histDateFrom)) return [];
                    const diff = s.difference ? parseFloat(s.difference) : null;
                    return (
                      <tr key={s.id} className="hover:bg-amber-50/30 transition-colors group">
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-xs text-slate-700">
                            {formatDateDisplay(s.createdAt)}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {formatTimeDisplay(s.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          {s.closedAt ? (
                            <>
                              <p className="font-mono text-xs text-slate-700">
                                {formatDateDisplay(s.closedAt)}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {formatTimeDisplay(s.closedAt)}
                              </p>
                            </>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                              ACTIVO
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-bold text-[#001e40]">
                          {s.registerName || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-right">
                          {fmt(s.expectedBalance || '0')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-right">
                          {s.actualBalance ? fmt(s.actualBalance) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {diff !== null ? (
                            <span className={clsx(
                              'text-[10px] px-2 py-0.5 rounded-full font-bold',
                              diff === 0 ? 'bg-emerald-100 text-emerald-800' :
                                diff > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                            )}>
                              {diff >= 0 ? '+' : ''}{fmt(diff)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-center gap-1">
                            <IconButton type="button" onClick={() => { h.setSelectedSession(s); h.setShowViewModal(true); }} title="Ver Detalle" aria-label={`Ver detalle del turno de ${s.registerName ?? 'caja'}`}>
                              <Eye className="w-4 h-4" />
                            </IconButton>
                            <IconButton
                              type="button"
                              onClick={() => {
                                window.open(`/api/v1/cash/sessions/${s.id}/print`, '_blank');
                              }}
                              title="Reimprimir"
                              aria-label={`Reimprimir el arqueo del turno de ${s.registerName ?? 'caja'}`}
                            >
                              <Printer className="w-4 h-4" />
                            </IconButton>
                            {/* Lote 176: dar por revisada la diferencia.
                                La ruta `/approve` existia desde siempre y
                                NADIE la llamaba, asi que `approved_by`
                                estaba vacio en todas las sesiones. Sin
                                esto, el aviso del panel no tendria como
                                apagarse y acabaria siendo ruido. */}
                            {diferenciaSinResolver(s) && (
                              <IconButton
                                type="button"
                                onClick={() => h.aprobarDiferencia(s.id)}
                                disabled={h.aprobando === s.id}
                                className="text-amber-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Dar por revisada la diferencia"
                                aria-label="Dar por revisada la diferencia del arqueo"
                              >
                                {h.aprobando === s.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <ShieldCheck className="w-4 h-4" />}
                              </IconButton>
                            )}
                            {s.approvedAt && (
                              <span className="p-1.5 flex items-center justify-center text-emerald-600" title="Diferencia revisada">
                                <ShieldCheck className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
            {h.history.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right" colSpan={3}>
                    Totales del Periodo
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right font-bold text-[#001e40]">
                    {fmt(h.history.reduce((s, x) => s + parseFloat(x.expectedBalance || '0'), 0))}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right font-bold text-[#001e40]">
                    {fmt(h.history.reduce((s, x) => s + parseFloat(x.actualBalance || '0'), 0))}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right font-bold text-red-700">
                    {fmt(h.history.reduce((s, x) => s + parseFloat(x.difference || '0'), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination placeholder */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">
            Mostrando {Math.min(h.history.length, 100)} de {h.history.length} registros
          </span>
        </div>
      </div>

      {/* KPI Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: <TrendingUp className="w-6 h-6 text-amber-700" />,
            bg: 'bg-amber-50',
            label: 'Promedio Diario',
            value: fmt(h.history.length > 0 ? h.history.reduce((s, x) => s + parseFloat(x.expectedBalance || '0'), 0) / h.history.length : 0),
          },
          {
            icon: <CheckCircle2 className="w-6 h-6 text-blue-700" />,
            bg: 'bg-blue-50',
            label: 'Cierres Cuadrados',
            value: `${h.history.filter(x => parseFloat(x.difference || '0') === 0).length} / ${h.history.length}`,
          },
          {
            icon: <AlertTriangle className="w-6 h-6 text-red-700" />,
            bg: 'bg-red-50',
            label: 'Diferencias Totales',
            value: fmt(h.history.reduce((s, x) => s + parseFloat(x.difference || '0'), 0)),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
            <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center', kpi.bg)}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-lg font-bold text-[#001e40]">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
