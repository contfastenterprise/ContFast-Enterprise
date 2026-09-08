'use client';

import { memo, useState, useEffect } from 'react';
import { RefreshCw, Search, Printer, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import DateRangePicker from '@/components/ui/date-range-picker';
import { useConfirm } from '@/providers/confirm-provider';
import { getLocalDateString, getFirstDayOfMonthString, formatDateDisplay } from '@/utils/fechasLocales';

/**
 * Cheques en garantia: pendientes de aplicar y aplicados.
 *
 * Auditoria P2-38 (2026-09-03), piloto de partir las paginas grandes. Este
 * componente ya existia como funcion aparte, pero vivia dentro de
 * dashboard/purchases/page.tsx (2.693 lineas, 65 estados en un solo
 * componente). Ahi, cualquier tecla en cualquier campo de la pagina lo
 * re-renderizaba entero. Fuera y envuelto en `memo`, sin props, solo se
 * re-renderiza por su propio estado.
 *
 * De paso se corrige un fallo de P2-33: `confirm(...)` aqui dentro no tenia
 * ningun `confirm` en su ambito -- el `useConfirm()` de PurchasesPage esta en
 * OTRO componente -- asi que resolvia al `window.confirm` global con un objeto
 * como mensaje: un dialogo nativo con "[object Object]". El build no lo vio
 * porque next.config.ts lleva `typescript: { ignoreBuildErrors: true }`.
 */
function GuaranteeChecksView() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [appliedList, setAppliedList] = useState<any[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState(getFirstDayOfMonthString());
  const [endDate, setEndDate] = useState(getLocalDateString());

  // Pagination states
  const [pendingPage, setPendingPage] = useState(1);
  const [appliedPage, setAppliedPage] = useState(1);
  const itemsPerPage = 10;

  // Los cheques en garantía son POST-FECHADOS: se emiten meses antes de cobrarse.
  // Por eso las dos listas se consultan distinto:
  //  - Pendientes: sin filtro de fecha (es un worklist accionable; filtrarlos por
  //    fecha de emisión escondía cheques vencidos y contradecía la alerta del dashboard).
  //  - Aplicados: el rango de fechas aplica sobre la fecha REAL de cobro (cleared_date),
  //    no sobre la de emisión.
  const fetchChecks = async () => {
    setLoading(true);
    try {
      const [pendingRes, appliedRes] = await Promise.all([
        fetch(`/api/v1/ap?payments=true&status=pending_guarantee&pageSize=1000`),
        fetch(`/api/v1/ap?payments=true&status=applied&dateField=cleared&startDate=${startDate}&endDate=${endDate}&pageSize=1000`)
      ]);
      const [pendingData, appliedData] = await Promise.all([pendingRes.json(), appliedRes.json()]);

      if (pendingData.success && appliedData.success) {
        setPendingList(pendingData.data?.items || []);
        setAppliedList(appliedData.data?.items || []);
        setPendingPage(1);
        setAppliedPage(1);
      } else {
        toast.error('Error al obtener cheques en garantía');
      }
    } catch (e) {
      toast.error('Error de red al cargar cheques en garantía');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecks();
  }, [startDate, endDate]);

  const handleApplyCheck = async (paymentId: string, checkId: string, checkNumber: string) => {
    if (
      !(await confirm({
        title: 'Aplicar cheque contablemente',
        description: `¿Estás seguro de que deseas aplicar contablemente el cheque #${checkNumber}? Esta operación deducirá el balance de CXP y registrará la salida del banco.`,
      }))
    ) return;

    setApplyingId(checkId);
    try {
      const res = await fetch('/api/v1/ap/payments/apply-guarantees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cheque #${checkNumber} aplicado exitosamente.`);
        fetchChecks();
      } else {
        toast.error(data.error?.message || 'Error al aplicar el cheque');
      }
    } catch (e) {
      toast.error('Error de red al procesar cheque');
    } finally {
      setApplyingId(null);
    }
  };

  // Solo cheques en garantía. Antes se usaba `checkStatus != null`, que también
  // dejaba pasar cheques ordinarios (no en garantía) al historial de aplicados.
  const isGuaranteeCheck = (p: any) => p.isGuarantee === true;

  const pendingChecks = pendingList.filter(isGuaranteeCheck);
  const appliedChecks = appliedList.filter(isGuaranteeCheck);

  const pendingStart = (pendingPage - 1) * itemsPerPage;
  const pendingEnd = pendingStart + itemsPerPage;
  const paginatedPending = pendingChecks.slice(pendingStart, pendingEnd);
  const totalPendingPages = Math.ceil(pendingChecks.length / itemsPerPage);

  const appliedStart = (appliedPage - 1) * itemsPerPage;
  const appliedEnd = appliedStart + itemsPerPage;
  const paginatedApplied = appliedChecks.slice(appliedStart, appliedEnd);
  const totalAppliedPages = Math.ceil(appliedChecks.length / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-xl p-4">
        <h3 className="font-bold text-[#c5a059] mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
          <Banknote className="h-5 w-5 text-amber-500" /> Control de Cheques en Garantía
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Aquí se listan todos los cheques dejados en garantía de compras a crédito. Puedes aplicarlos contablemente de manera manual cuando el suplidor confirme su cobro.
          Los <strong>pendientes</strong> se muestran siempre completos (sin filtro de fecha); el rango de fechas solo filtra el <strong>historial de cobrados</strong>.
        </p>

        {/* Date Filter Panel */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-8 pb-6 border-b border-slate-200">
          <div className="w-full max-w-md">
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Rango de Fechas (historial de cobrados)</label>
            <div className="w-full [&>div]:w-full [&_button]:w-full">
              <DateRangePicker
                from={startDate}
                to={endDate}
                onChange={({ from, to }) => {
                  setStartDate(from);
                  setEndDate(to);
                }}
              />
            </div>
          </div>
          <button
            onClick={fetchChecks}
            disabled={loading}
            className="bg-[#005E63] hover:bg-[#004d51] text-white h-8 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </button>
          {!loading && (
            <button
              type="button"
              onClick={() => {
                window.open(`/api/v1/ap/payments/report?startDate=${startDate}&endDate=${endDate}`, '_blank');
              }}
              className="bg-[#005E63] hover:bg-[#004d51] text-white h-8 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 flex items-center gap-1.5 self-start sm:self-auto animate-fade-in"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir Reporte
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <RefreshCw className="h-8 w-8 text-[#c5a059] animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pendientes */}
            <div>
              <h4 className="font-bold text-[#c5a059] mb-3 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                Cheques Pendientes por Cobrar ({pendingChecks.length})
              </h4>
              <div className="bg-white/50 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Suplidor</th>
                      <th className="px-4 py-2.5">Cheque #</th>
                      <th className="px-4 py-2.5">Fecha Emisión</th>
                      <th className="px-4 py-2.5 text-amber-700">Fecha de Cobro</th>
                      <th className="px-4 py-2.5 text-right">Monto</th>
                      <th className="px-4 py-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-xs">
                    {pendingChecks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                          No hay cheques en garantía pendientes.
                        </td>
                      </tr>
                    ) : (
                      paginatedPending.map(p => {
                        const isDue = p.dueDate <= getLocalDateString();
                        return (
                          <tr key={p.id} className={isDue ? "bg-amber-50/30" : ""}>
                            <td className="px-4 py-2.5 text-xs font-bold text-[#c5a059]">{p.supplierName}</td>
                            <td className="px-4 py-2.5 text-xs font-mono font-bold">{p.checkNumber || 'S/N'}</td>
                            <td className="px-4 py-2.5 text-xs font-mono">{formatDateDisplay(p.paymentDate)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono font-bold text-amber-600 flex items-center gap-1">
                              {isDue && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping"></span>}
                              {formatDateDisplay(p.dueDate)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-[#c5a059]">
                              RD$ {parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-center">
                              <button
                                onClick={() => handleApplyCheck(p.id, p.checkId, p.checkNumber)}
                                disabled={applyingId === p.checkId}
                                className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition shadow-sm shadow-amber-600/10 hover:shadow-md hover:shadow-amber-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                {applyingId === p.checkId ? 'Procesando...' : 'Aplicar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {totalPendingPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between mt-4 text-xs text-slate-500 gap-3">
                  <span>
                    Mostrando {pendingStart + 1} a {Math.min(pendingEnd, pendingChecks.length)} de {pendingChecks.length} cheques pendientes
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPendingPage(p => Math.max(1, p - 1))}
                      disabled={pendingPage === 1}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-surface-container text-[#c5a059] rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/20 active:scale-95"
                    >
                      Anterior
                    </button>
                    <span className="font-semibold text-[#c5a059] px-2">
                      Pág. {pendingPage} de {totalPendingPages}
                    </span>
                    <button
                      onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))}
                      disabled={pendingPage === totalPendingPages}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-surface-container text-[#c5a059] rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/20 active:scale-95"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Aplicados */}
            <div>
              <h4 className="font-bold text-[#c5a059] mb-3 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                Historial de Cheques Aplicados ({appliedChecks.length})
              </h4>
              <div className="bg-white/50 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Suplidor</th>
                      <th className="px-4 py-2.5">Cheque #</th>
                      <th className="px-4 py-2.5">Fecha Emisión</th>
                      <th className="px-4 py-2.5">Fecha Cobrado</th>
                      <th className="px-4 py-2.5 text-right">Monto</th>
                      <th className="px-4 py-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-xs">
                    {appliedChecks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                          No hay historial de cheques aplicados.
                        </td>
                      </tr>
                    ) : (
                      paginatedApplied.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-600">{p.supplierName}</td>
                          <td className="px-4 py-2.5 text-xs font-mono font-medium">{p.checkNumber || 'S/N'}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{formatDateDisplay(p.paymentDate)}</td>
                          <td className="px-4 py-2.5 text-xs font-mono font-medium">{formatDateDisplay(p.clearedDate || p.dueDate)}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono font-bold text-slate-600">
                            RD$ {parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-250">
                              ACEPTADO
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalAppliedPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between mt-4 text-xs text-slate-500 gap-3">
                  <span>
                    Mostrando {appliedStart + 1} a {Math.min(appliedEnd, appliedChecks.length)} de {appliedChecks.length} cheques aplicados
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAppliedPage(p => Math.max(1, p - 1))}
                      disabled={appliedPage === 1}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-surface-container text-[#c5a059] rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/20 active:scale-95"
                    >
                      Anterior
                    </button>
                    <span className="font-semibold text-[#c5a059] px-2">
                      Pág. {appliedPage} de {totalAppliedPages}
                    </span>
                    <button
                      onClick={() => setAppliedPage(p => Math.min(totalAppliedPages, p + 1))}
                      disabled={appliedPage === totalAppliedPages}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-surface-container text-[#c5a059] rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/20 active:scale-95"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(GuaranteeChecksView);
